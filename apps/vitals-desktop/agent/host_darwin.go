//go:build darwin

package main

/*
#cgo LDFLAGS: -framework IOKit -framework CoreFoundation
#include <mach/mach.h>
#include <mach/mach_host.h>
#include <mach/mach_time.h>
#include <mach/processor_info.h>
#include <mach/vm_statistics.h>
#include <sys/sysctl.h>
#include <sys/time.h>
#include <sys/proc_info.h>
#include <libproc.h>
#include <net/if.h>
#include <net/if_dl.h>
#include <net/route.h>
#include <stdlib.h>
#include <string.h>
#include <CoreFoundation/CoreFoundation.h>
#include <IOKit/IOKitLib.h>
#include <IOKit/IOBSD.h>
#include <IOKit/storage/IOBlockStorageDriver.h>

typedef struct { uint64_t user, system, idle, nice; } vitals_cpu;
typedef struct { char name[IFNAMSIZ]; uint64_t rx, tx; uint32_t flags; } vitals_if;
typedef struct { char name[32]; uint64_t rbytes, wbytes, rtime, wtime; } vitals_disk;
typedef struct { int32_t pid; uint32_t uid; uint64_t cpu_ns, rss; char name[2 * MAXCOMLEN + 1]; } vitals_proc;

// mach_host_self() returns a new send right on every call; keep one.
static mach_port_t vitals_host_port(void) {
	static mach_port_t port = MACH_PORT_NULL;
	if (port == MACH_PORT_NULL) port = mach_host_self();
	return port;
}

static int vitals_cpu_ticks(vitals_cpu *out, int max) {
	natural_t count = 0;
	processor_info_array_t info;
	mach_msg_type_number_t info_count = 0;
	if (host_processor_info(vitals_host_port(), PROCESSOR_CPU_LOAD_INFO, &count, &info, &info_count) != KERN_SUCCESS) {
		return -1;
	}
	processor_cpu_load_info_t load = (processor_cpu_load_info_t)info;
	int n = (int)count < max ? (int)count : max;
	for (int i = 0; i < n; i++) {
		out[i].user = load[i].cpu_ticks[CPU_STATE_USER];
		out[i].system = load[i].cpu_ticks[CPU_STATE_SYSTEM];
		out[i].idle = load[i].cpu_ticks[CPU_STATE_IDLE];
		out[i].nice = load[i].cpu_ticks[CPU_STATE_NICE];
	}
	vm_deallocate(mach_task_self(), (vm_address_t)info, info_count * sizeof(integer_t));
	return n;
}

// Used memory matches Activity Monitor: app memory (anonymous minus
// purgeable) + wired + compressed.
static int vitals_mem(uint64_t *total, uint64_t *used, uint64_t *swap_total, uint64_t *swap_used) {
	int mib[2] = {CTL_HW, HW_MEMSIZE};
	size_t len = sizeof(*total);
	if (sysctl(mib, 2, total, &len, NULL, 0) != 0) return -1;
	vm_statistics64_data_t vm;
	mach_msg_type_number_t n = HOST_VM_INFO64_COUNT;
	if (host_statistics64(vitals_host_port(), HOST_VM_INFO64, (host_info64_t)&vm, &n) != KERN_SUCCESS) return -1;
	uint64_t page = vm_kernel_page_size;
	uint64_t app = vm.internal_page_count > vm.purgeable_count ? vm.internal_page_count - vm.purgeable_count : 0;
	*used = (app + vm.wire_count + vm.compressor_page_count) * page;
	struct xsw_usage sw;
	int smib[2] = {CTL_VM, VM_SWAPUSAGE};
	len = sizeof(sw);
	if (sysctl(smib, 2, &sw, &len, NULL, 0) == 0) {
		*swap_total = sw.xsu_total;
		*swap_used = sw.xsu_used;
	}
	return 0;
}

static double vitals_uptime(void) {
	struct timeval boot, now;
	int mib[2] = {CTL_KERN, KERN_BOOTTIME};
	size_t len = sizeof(boot);
	if (sysctl(mib, 2, &boot, &len, NULL, 0) != 0 || gettimeofday(&now, NULL) != 0) return -1;
	return (double)(now.tv_sec - boot.tv_sec) + (double)(now.tv_usec - boot.tv_usec) / 1e6;
}

// NET_RT_IFLIST2 carries 64-bit byte counters; getifaddrs only has 32-bit ones.
static int vitals_net(vitals_if *out, int max) {
	int mib[6] = {CTL_NET, PF_ROUTE, 0, 0, NET_RT_IFLIST2, 0};
	size_t len = 0;
	if (sysctl(mib, 6, NULL, &len, NULL, 0) != 0) return -1;
	char *buf = malloc(len);
	if (buf == NULL) return -1;
	if (sysctl(mib, 6, buf, &len, NULL, 0) != 0) {
		free(buf);
		return -1;
	}
	int n = 0;
	for (char *p = buf; p + sizeof(struct if_msghdr) <= buf + len && n < max;) {
		struct if_msghdr *ifm = (struct if_msghdr *)p;
		if (ifm->ifm_msglen == 0) break;
		if (ifm->ifm_type == RTM_IFINFO2) {
			struct if_msghdr2 *m2 = (struct if_msghdr2 *)p;
			struct sockaddr_dl *sdl = (struct sockaddr_dl *)(m2 + 1);
			if ((m2->ifm_addrs & RTA_IFP) && sdl->sdl_family == AF_LINK && sdl->sdl_nlen > 0 && sdl->sdl_nlen < IFNAMSIZ) {
				memcpy(out[n].name, sdl->sdl_data, sdl->sdl_nlen);
				out[n].name[sdl->sdl_nlen] = 0;
				out[n].rx = m2->ifm_data.ifi_ibytes;
				out[n].tx = m2->ifm_data.ifi_obytes;
				out[n].flags = (uint32_t)m2->ifm_flags;
				n++;
			}
		}
		p += ifm->ifm_msglen;
	}
	free(buf);
	return n;
}

static void vitals_cf_u64(CFDictionaryRef dict, CFStringRef key, uint64_t *out) {
	CFNumberRef num = (CFNumberRef)CFDictionaryGetValue(dict, key);
	int64_t v = 0;
	if (num != NULL && CFGetTypeID(num) == CFNumberGetTypeID() && CFNumberGetValue(num, kCFNumberSInt64Type, &v) && v > 0) {
		*out = (uint64_t)v;
	}
}

// Physical block devices only: IOBlockStorageDriver sits under real disks,
// not under synthesized APFS containers.
static int vitals_disks(vitals_disk *out, int max) {
	io_iterator_t it;
	if (IOServiceGetMatchingServices(MACH_PORT_NULL, IOServiceMatching(kIOBlockStorageDriverClass), &it) != KERN_SUCCESS) {
		return -1;
	}
	int n = 0;
	io_registry_entry_t drv;
	while (n < max && (drv = IOIteratorNext(it)) != 0) {
		io_registry_entry_t media = 0;
		if (IORegistryEntryGetChildEntry(drv, kIOServicePlane, &media) == KERN_SUCCESS) {
			CFTypeRef bsd = IORegistryEntryCreateCFProperty(media, CFSTR(kIOBSDNameKey), kCFAllocatorDefault, 0);
			CFTypeRef stats = IORegistryEntryCreateCFProperty(drv, CFSTR(kIOBlockStorageDriverStatisticsKey), kCFAllocatorDefault, 0);
			if (bsd != NULL && stats != NULL && CFGetTypeID(bsd) == CFStringGetTypeID() && CFGetTypeID(stats) == CFDictionaryGetTypeID()) {
				memset(&out[n], 0, sizeof(out[n]));
				if (CFStringGetCString((CFStringRef)bsd, out[n].name, sizeof(out[n].name), kCFStringEncodingUTF8)) {
					CFDictionaryRef d = (CFDictionaryRef)stats;
					vitals_cf_u64(d, CFSTR(kIOBlockStorageDriverStatisticsBytesReadKey), &out[n].rbytes);
					vitals_cf_u64(d, CFSTR(kIOBlockStorageDriverStatisticsBytesWrittenKey), &out[n].wbytes);
					vitals_cf_u64(d, CFSTR(kIOBlockStorageDriverStatisticsTotalReadTimeKey), &out[n].rtime);
					vitals_cf_u64(d, CFSTR(kIOBlockStorageDriverStatisticsTotalWriteTimeKey), &out[n].wtime);
					n++;
				}
			}
			if (bsd != NULL) CFRelease(bsd);
			if (stats != NULL) CFRelease(stats);
			IOObjectRelease(media);
		}
		IOObjectRelease(drv);
	}
	IOObjectRelease(it);
	return n;
}

// pti_total_* are mach absolute time units (ticks on Apple silicon), so they
// are scaled by the timebase. Tasks of other users fail with EPERM unless the
// agent runs as root; they are skipped. *total reports how many pids exist.
static int vitals_procs(vitals_proc *out, int max, int *total) {
	static mach_timebase_info_data_t tb;
	if (tb.denom == 0 && mach_timebase_info(&tb) != KERN_SUCCESS) return -1;
	int cap = proc_listallpids(NULL, 0);
	if (cap <= 0) return -1;
	cap += 64;
	pid_t *pids = malloc(sizeof(pid_t) * cap);
	if (pids == NULL) return -1;
	int count = proc_listallpids(pids, (int)(sizeof(pid_t) * cap));
	if (count < 0) {
		free(pids);
		return -1;
	}
	*total = count;
	int n = 0;
	for (int i = 0; i < count && n < max; i++) {
		pid_t pid = pids[i];
		if (pid <= 0) continue;
		struct proc_taskinfo ti;
		if (proc_pidinfo(pid, PROC_PIDTASKINFO, 0, &ti, sizeof(ti)) != sizeof(ti)) continue;
		struct proc_bsdshortinfo bi;
		if (proc_pidinfo(pid, PROC_PIDT_SHORTBSDINFO, 0, &bi, sizeof(bi)) != sizeof(bi)) continue;
		__uint128_t t = (__uint128_t)(ti.pti_total_user + ti.pti_total_system);
		out[n].pid = pid;
		out[n].uid = bi.pbsi_uid;
		out[n].cpu_ns = (uint64_t)(t * tb.numer / tb.denom);
		out[n].rss = ti.pti_resident_size;
		if (proc_name(pid, out[n].name, sizeof(out[n].name)) <= 0) {
			strlcpy(out[n].name, bi.pbsi_comm, sizeof(out[n].name));
		}
		n++;
	}
	free(pids);
	return n;
}

static int64_t vitals_owner(int pid) {
	struct proc_bsdshortinfo bi;
	if (proc_pidinfo(pid, PROC_PIDT_SHORTBSDINFO, 0, &bi, sizeof(bi)) != sizeof(bi)) return -1;
	return (int64_t)bi.pbsi_uid;
}
*/
import "C"

import (
	"context"
	"errors"
	"io"
	"os"
	"os/user"
	"runtime"
	"strconv"
	"strings"
	"syscall"
	"time"
	"unsafe"

	"github.com/polterware/polterware/apps/vitals-desktop/agent/internal/metrics"
)

const (
	darwinMaxCPUs  = 512
	darwinMaxIfs   = 128
	darwinMaxDisks = 64

	mntLocal      = 0x00001000
	mntDontBrowse = 0x00100000
	mntNoWait     = 2
)

type host struct {
	start time.Time
	users map[uint32]string
	cpus  []C.vitals_cpu
	ifs   []C.vitals_if
	disks []C.vitals_disk
	procs []C.vitals_proc
}

func runAgent(ctx context.Context, in io.Reader, out io.Writer) error {
	h := &host{
		start: time.Now(),
		users: map[uint32]string{},
		cpus:  make([]C.vitals_cpu, darwinMaxCPUs),
		ifs:   make([]C.vitals_if, darwinMaxIfs),
		disks: make([]C.vitals_disk, darwinMaxDisks),
		procs: make([]C.vitals_proc, 1024),
	}
	tk := time.NewTicker(fastEvery)
	defer tk.Stop()
	return serve(ctx, in, out, h, tk.C)
}

func (h *host) hello() helloMsg {
	name, err := os.Hostname()
	if err != nil || name == "" {
		name = "unknown"
	}
	kernel, err := syscall.Sysctl("kern.osrelease")
	if err != nil || kernel == "" {
		kernel = "unknown"
	}
	return helloMsg{
		Type: "hello", V: protocolVersion, AgentVersion: agentVersion,
		Arch: runtime.GOARCH, Hostname: name, Kernel: "Darwin " + kernel, CPUCount: runtime.NumCPU(),
	}
}

func (h *host) gpuEnabled() bool { return false }

func (h *host) sampleFast() fastRaw {
	raw := fastRaw{When: time.Now(), Mono: time.Since(h.start)}

	if n := int(C.vitals_cpu_ticks(&h.cpus[0], C.int(len(h.cpus)))); n <= 0 {
		raw.CPUWarn = "host_processor_info failed"
	} else {
		raw.CPUs = darwinCPUSamples(h.cpus[:n])
	}

	var total, used, swapTotal, swapUsed C.uint64_t
	if C.vitals_mem(&total, &used, &swapTotal, &swapUsed) != 0 {
		raw.MemWarn = "host_statistics64 failed"
	} else {
		raw.Mem = darwinMemory(uint64(total), uint64(used), uint64(swapTotal), uint64(swapUsed))
	}

	if n := int(C.vitals_net(&h.ifs[0], C.int(len(h.ifs)))); n < 0 {
		raw.NetWarn = "NET_RT_IFLIST2 failed"
	} else {
		raw.Nets = darwinNets(h.ifs[:n])
	}

	var load [3]C.double
	if C.getloadavg(&load[0], 3) != 3 {
		raw.LoadWarn = "getloadavg failed"
	} else {
		raw.Load = [3]float64{float64(load[0]), float64(load[1]), float64(load[2])}
	}

	if up := float64(C.vitals_uptime()); up < 0 {
		raw.UpWarn = "kern.boottime failed"
	} else {
		raw.Uptime = up
	}

	if n := int(C.vitals_disks(&h.disks[0], C.int(len(h.disks)))); n < 0 {
		raw.DiskWarn = "IOKit block storage query failed"
	} else {
		raw.Disks = darwinDisks(h.disks[:n])
	}
	return raw
}

func darwinCPUSamples(cpus []C.vitals_cpu) []metrics.CPUSample {
	out := make([]metrics.CPUSample, 0, len(cpus)+1)
	agg := metrics.CPUSample{Name: "cpu"}
	for i, c := range cpus {
		s := metrics.CPUSample{
			Name: "cpu" + strconv.Itoa(i),
			User: uint64(c.user), Nice: uint64(c.nice), System: uint64(c.system), Idle: uint64(c.idle),
		}
		agg.User += s.User
		agg.Nice += s.Nice
		agg.System += s.System
		agg.Idle += s.Idle
		out = append(out, s)
	}
	return append([]metrics.CPUSample{agg}, out...)
}

func darwinMemory(total, used, swapTotal, swapUsed uint64) metrics.Memory {
	if used > total {
		used = total
	}
	if swapUsed > swapTotal {
		swapUsed = swapTotal
	}
	return metrics.Memory{
		TotalKb: total / 1024, AvailableKb: (total - used) / 1024, UsedKb: used / 1024,
		SwapTotalKb: swapTotal / 1024, SwapFreeKb: (swapTotal - swapUsed) / 1024, SwapUsedKb: swapUsed / 1024,
	}
}

// Physical macOS NICs are en*. awdl/llw (AirDrop), utun, bridge and anpi are
// virtual or internal. Interfaces that are down are skipped.
func darwinNets(ifs []C.vitals_if) []metrics.NetSample {
	out := make([]metrics.NetSample, 0, len(ifs))
	for i := range ifs {
		name := C.GoString(&ifs[i].name[0])
		flags := uint32(ifs[i].flags)
		if !strings.HasPrefix(name, "en") || flags&syscall.IFF_UP == 0 || flags&syscall.IFF_RUNNING == 0 {
			continue
		}
		out = append(out, metrics.NetSample{Name: name, RX: uint64(ifs[i].rx), TX: uint64(ifs[i].tx)})
	}
	return out
}

// IOKit reports bytes and cumulative request time in ns. Busy time is the
// sum of read and write service time, so overlapping requests can push the
// raw value above wall time; DiskRates caps utilization at 100.
func darwinDisks(disks []C.vitals_disk) []metrics.DiskSample {
	out := make([]metrics.DiskSample, 0, len(disks))
	for i := range disks {
		d := disks[i]
		out = append(out, metrics.DiskSample{
			Device:       C.GoString(&d.name[0]),
			ReadSectors:  uint64(d.rbytes) / metrics.SectorSize,
			WriteSectors: uint64(d.wbytes) / metrics.SectorSize,
			IOTimeMs:     (uint64(d.rtime) + uint64(d.wtime)) / 1_000_000,
		})
	}
	return out
}

func (h *host) sampleProcs(_ uint64) ([]metrics.ProcessSample, error) {
	var total C.int
	n := int(C.vitals_procs(&h.procs[0], C.int(len(h.procs)), &total))
	if n < 0 {
		return nil, errors.New("proc_listallpids failed")
	}
	if int(total) > len(h.procs) {
		// Grow for the next sample; this one is ranked from what fit.
		h.procs = make([]C.vitals_proc, int(total)+256)
	}
	rows := h.procs[:n]
	out := make([]metrics.ProcessSample, 0, n)
	for i := range rows {
		p := rows[i]
		out = append(out, metrics.ProcessSample{
			PID: int(p.pid), User: h.userName(uint32(p.uid)), Command: C.GoString(&p.name[0]),
			CPUNs: uint64(p.cpu_ns), RSSBytes: uint64(p.rss),
		})
	}
	return out, nil
}

func (h *host) userName(uid uint32) string {
	if name, ok := h.users[uid]; ok {
		return name
	}
	name := strconv.FormatUint(uint64(uid), 10)
	if u, err := user.LookupId(name); err == nil && u.Username != "" {
		name = u.Username
	}
	h.users[uid] = name
	return name
}

func (h *host) sampleDisks() ([]diskMsg, error) {
	n, err := syscall.Getfsstat(nil, mntNoWait)
	if err != nil {
		return nil, err
	}
	buf := make([]syscall.Statfs_t, n+8)
	n, err = syscall.Getfsstat(buf, mntNoWait)
	if err != nil {
		return nil, err
	}
	out := make([]diskMsg, 0, n)
	for i := range buf[:n] {
		st := &buf[i]
		fstype := cString(st.Fstypename[:])
		// Finder hides MNT_DONTBROWSE volumes (the sealed system snapshot's
		// sibling volumes); they share the container's free space with "/".
		if st.Flags&mntLocal == 0 || st.Flags&mntDontBrowse != 0 || fstype == "devfs" || fstype == "autofs" {
			continue
		}
		u := metrics.Usage(st.Blocks, st.Bfree, st.Bavail, uint64(st.Bsize))
		out = append(out, diskMsg{
			Filesystem: cString(st.Mntfromname[:]), SizeKb: u.SizeKb, UsedKb: u.UsedKb,
			AvailKb: u.AvailKb, UsePercent: u.UsePercent, MountPoint: cString(st.Mntonname[:]),
		})
	}
	return out, nil
}

func cString(b []int8) string {
	raw := unsafe.Slice((*byte)(unsafe.Pointer(&b[0])), len(b))
	if i := strings.IndexByte(string(raw), 0); i >= 0 {
		raw = raw[:i]
	}
	return string(raw)
}

// Reading SMC temperature sensors needs private IOKit APIs; none are reported.
func (h *host) sampleThermals() ([]thermalMsg, error) { return []thermalMsg{}, nil }

func (h *host) sampleGPUs() ([]gpuMsg, error) { return nil, nil }

func (h *host) kill(pid int, sig string) error {
	owner := int(C.vitals_owner(C.int(pid)))
	var ownerErr error
	if owner < 0 {
		ownerErr = errors.New("process not found")
	}
	if err := authorizeKill(pid, os.Getuid(), owner, ownerErr, sig); err != nil {
		return err
	}
	s := syscall.SIGTERM
	if sig == "KILL" {
		s = syscall.SIGKILL
	}
	return syscall.Kill(pid, s)
}
