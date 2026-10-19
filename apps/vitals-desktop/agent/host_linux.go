//go:build linux

package main

import (
	"context"
	"errors"
	"io"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/polterware/polterware/apps/vitals-desktop/agent/internal/metrics"
)

// Linux USER_HZ. CGO is disabled, so sysconf(_SC_CLK_TCK) is not available.
const (
	userHZ = 100
	tickNs = 1_000_000_000 / userHZ
)

// host reads the stable /proc files once and rereads them with pread.
// Per-pid files are opened per sample: a recycled pid would keep a dead inode.
type host struct {
	start  time.Time
	page   uint64
	gpu    bool
	passwd map[int]string
	phys   map[string]bool

	sysChecked bool
	sysOK      bool
	psiChecked bool

	stat      *procFile
	meminfo   *procFile
	netdev    *procFile
	loadavg   *procFile
	uptime    *procFile
	diskstats *procFile
	mounts    *procFile
	psiCPU    *procFile
	psiMem    *procFile
	psiIO     *procFile
}

func runAgent(ctx context.Context, in io.Reader, out io.Writer) error {
	h := newHost()
	defer h.close()
	tk := time.NewTicker(fastEvery)
	defer tk.Stop()
	return serve(ctx, in, out, h, tk.C)
}

func newHost() *host {
	page := os.Getpagesize()
	if page <= 0 {
		page = 4096
	}
	return &host{
		start:  time.Now(),
		page:   uint64(page),
		gpu:    hasNvidiaSMI(),
		passwd: loadPasswd(),
		phys:   map[string]bool{},
	}
}

func (h *host) close() {
	for _, f := range []*procFile{
		h.stat, h.meminfo, h.netdev, h.loadavg, h.uptime, h.diskstats, h.mounts,
		h.psiCPU, h.psiMem, h.psiIO,
	} {
		_ = f.Close()
	}
}

func (h *host) hello() helloMsg {
	name, err := os.Hostname()
	if err != nil || name == "" {
		name = "unknown"
	}
	kernel := "unknown"
	if b, rerr := os.ReadFile("/proc/sys/kernel/osrelease"); rerr == nil {
		kernel = strings.TrimSpace(string(b))
		if kernel == "" {
			kernel = "unknown"
		}
	}
	cpus := runtime.NumCPU()
	if text, rerr := h.text(&h.stat, "/proc/stat"); rerr == nil {
		if n := metrics.CPUCount(metrics.ParseProcStat(text)); n > 0 {
			cpus = n
		}
	}
	return helloMsg{
		Type: "hello", V: protocolVersion, AgentVersion: agentVersion,
		Arch: runtime.GOARCH, Hostname: name, Kernel: kernel, CPUCount: cpus,
	}
}

func (h *host) gpuEnabled() bool { return h.gpu }

func (h *host) sampleFast() fastRaw {
	raw := fastRaw{When: time.Now(), Mono: time.Since(h.start)}

	if text, err := h.text(&h.stat, "/proc/stat"); err != nil {
		raw.CPUWarn = err.Error()
	} else {
		raw.CPUs = metrics.ParseProcStat(text)
	}
	if text, err := h.text(&h.meminfo, "/proc/meminfo"); err != nil {
		raw.MemWarn = err.Error()
	} else {
		raw.Mem = metrics.ParseMeminfo(text)
	}
	if text, err := h.text(&h.netdev, "/proc/net/dev"); err != nil {
		raw.NetWarn = err.Error()
	} else {
		raw.Nets = metrics.FilterNet(metrics.ParseNetDev(text), h.keepIface)
	}
	if text, err := h.text(&h.loadavg, "/proc/loadavg"); err != nil {
		raw.LoadWarn = err.Error()
	} else if load, ok := metrics.ParseLoadavg(text); !ok {
		raw.LoadWarn = "bad loadavg"
	} else {
		raw.Load = load
	}
	if text, err := h.text(&h.uptime, "/proc/uptime"); err != nil {
		raw.UpWarn = err.Error()
	} else if up, ok := metrics.ParseUptime(text); !ok {
		raw.UpWarn = "bad uptime"
	} else {
		raw.Uptime = up
	}
	if text, err := h.text(&h.diskstats, "/proc/diskstats"); err != nil {
		raw.DiskWarn = err.Error()
	} else {
		raw.Disks = metrics.FilterDisks(metrics.ParseDiskstats(text), h.keepDisk)
	}

	h.ensurePSI()
	if h.psiCPU != nil || h.psiMem != nil || h.psiIO != nil {
		p := &metrics.Pressure{}
		var psiErr error
		if v, err := h.readPSI(h.psiCPU); err != nil {
			psiErr = err
		} else {
			p.CPU = v
		}
		if v, err := h.readPSI(h.psiMem); err != nil && psiErr == nil {
			psiErr = err
		} else if err == nil {
			p.Memory = v
		}
		if v, err := h.readPSI(h.psiIO); err != nil && psiErr == nil {
			psiErr = err
		} else if err == nil {
			p.IO = v
		}
		if psiErr != nil {
			raw.PressureWarn = psiErr.Error()
		} else {
			raw.Pressure = p
		}
	}
	return raw
}

func (h *host) sampleProcs(_ uint64) ([]metrics.ProcessSample, error) {
	entries, err := os.ReadDir("/proc")
	if err != nil {
		return nil, err
	}
	buf := make([]byte, 64*1024)
	out := make([]metrics.ProcessSample, 0, 64)
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		pid, err := strconv.Atoi(e.Name())
		if err != nil || pid <= 0 {
			continue
		}
		base := "/proc/" + e.Name()
		n, err := preadFile(base+"/stat", buf)
		if err != nil || n == 0 || n == len(buf) {
			continue
		}
		st, err := metrics.ParsePIDStat(string(buf[:n]))
		if err != nil {
			continue
		}
		n, err = preadFile(base+"/status", buf)
		if err != nil || n == 0 || n == len(buf) {
			continue
		}
		uid, err := metrics.ParseStatusUID(string(buf[:n]))
		if err != nil {
			continue
		}
		user := strconv.Itoa(uid)
		if name, ok := h.passwd[uid]; ok {
			user = name
		}
		out = append(out, metrics.ProcessSample{
			PID: st.PID, User: user, Command: st.Command,
			CPUNs: st.Ticks() * tickNs, RSSBytes: st.RSSPages * h.page,
		})
	}
	return out, nil
}

func (h *host) sampleDisks() ([]diskMsg, error) {
	text, err := h.text(&h.mounts, "/proc/mounts")
	if err != nil {
		return nil, err
	}
	mounts := metrics.ParseMounts(text)
	out := make([]diskMsg, 0, len(mounts))
	for _, m := range mounts {
		u, err := statUsage(m.MountPoint)
		if err != nil {
			continue
		}
		out = append(out, diskMsg{
			Filesystem: m.Device, SizeKb: u.SizeKb, UsedKb: u.UsedKb,
			AvailKb: u.AvailKb, UsePercent: u.UsePercent, MountPoint: m.MountPoint,
		})
	}
	if len(mounts) > 0 && len(out) == 0 {
		return nil, errors.New("statfs failed")
	}
	return out, nil
}

func (h *host) sampleThermals() ([]thermalMsg, error) {
	matches, err := filepath.Glob("/sys/class/thermal/thermal_zone*/temp")
	if err != nil {
		return nil, err
	}
	sort.Strings(matches)
	out := make([]thermalMsg, 0, len(matches))
	for _, path := range matches {
		b, err := os.ReadFile(path)
		if err != nil {
			continue
		}
		c, err := metrics.MilliCelsius(string(b))
		if err != nil {
			continue
		}
		out = append(out, thermalMsg{ID: filepath.Base(filepath.Dir(path)), Celsius: c})
	}
	return out, nil
}

func (h *host) sampleGPUs() ([]gpuMsg, error) { return sampleNvidiaSMI() }

func (h *host) kill(pid int, sig string) error {
	owner, err := readOwner(pid)
	if err := authorizeKill(pid, os.Getuid(), owner, err, sig); err != nil {
		return err
	}
	s := syscall.SIGTERM
	if sig == "KILL" {
		s = syscall.SIGKILL
	}
	return syscall.Kill(pid, s)
}

func (h *host) text(slot **procFile, path string) (string, error) {
	if *slot == nil {
		f, err := openProc(path)
		if err != nil {
			return "", err
		}
		*slot = f
	}
	b, err := (*slot).Read()
	if err != nil {
		_ = (*slot).Close()
		*slot = nil
		return "", err
	}
	return string(b), nil
}

func (h *host) ensurePSI() {
	if h.psiChecked {
		return
	}
	h.psiChecked = true
	h.psiCPU, _ = openProc("/proc/pressure/cpu")
	h.psiMem, _ = openProc("/proc/pressure/memory")
	h.psiIO, _ = openProc("/proc/pressure/io")
}

func (h *host) readPSI(f *procFile) (float64, error) {
	if f == nil {
		return 0, nil
	}
	b, err := f.Read()
	if err != nil {
		return 0, err
	}
	v, _ := metrics.ParsePSIAvg10(string(b))
	return v, nil
}

func (h *host) keepIface(name string) bool {
	if metrics.IsVirtualIfaceName(name) {
		return false
	}
	if v, ok := h.phys[name]; ok {
		return v
	}
	_, err := os.Lstat("/sys/class/net/" + name + "/device")
	ok := err == nil
	h.phys[name] = ok
	return ok
}

func (h *host) keepDisk(name string) bool {
	if metrics.SkipDiskName(name) {
		return false
	}
	if !h.sysChecked {
		h.sysChecked = true
		fi, err := os.Stat("/sys/block")
		h.sysOK = err == nil && fi.IsDir()
	}
	if !h.sysOK {
		return metrics.LooksLikeWholeDisk(name)
	}
	fi, err := os.Stat("/sys/block/" + name)
	return err == nil && fi.IsDir()
}

func statUsage(path string) (metrics.DiskUsage, error) {
	var st syscall.Statfs_t
	if err := syscall.Statfs(path, &st); err != nil {
		return metrics.DiskUsage{}, err
	}
	if st.Bsize <= 0 {
		return metrics.DiskUsage{}, errors.New("bad block size")
	}
	return metrics.Usage(uint64(st.Blocks), uint64(st.Bfree), uint64(st.Bavail), uint64(st.Bsize)), nil
}

func readOwner(pid int) (int, error) {
	b, err := os.ReadFile("/proc/" + strconv.Itoa(pid) + "/status")
	if err != nil {
		return 0, errors.New("process not found")
	}
	return metrics.ParseStatusUID(string(b))
}

func loadPasswd() map[int]string {
	m := map[int]string{}
	b, err := os.ReadFile("/etc/passwd")
	if err != nil {
		return m
	}
	for _, line := range strings.Split(string(b), "\n") {
		parts := strings.Split(line, ":")
		if len(parts) < 3 {
			continue
		}
		uid, err := strconv.Atoi(parts[2])
		if err != nil {
			continue
		}
		if _, ok := m[uid]; !ok {
			m[uid] = parts[0]
		}
	}
	return m
}
