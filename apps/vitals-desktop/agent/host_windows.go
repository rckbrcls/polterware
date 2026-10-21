//go:build windows && (amd64 || arm64)

package main

import (
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"runtime"
	"strconv"
	"syscall"
	"time"
	"unsafe"

	"github.com/polterware/polterware/apps/vitals-desktop/agent/internal/metrics"
)

var (
	ntdll    = syscall.NewLazyDLL("ntdll.dll")
	kernel32 = syscall.NewLazyDLL("kernel32.dll")
	iphlpapi = syscall.NewLazyDLL("iphlpapi.dll")

	procNtQuerySystemInformation = ntdll.NewProc("NtQuerySystemInformation")
	procRtlGetVersion            = ntdll.NewProc("RtlGetVersion")
	procGlobalMemoryStatusEx     = kernel32.NewProc("GlobalMemoryStatusEx")
	procGetTickCount64           = kernel32.NewProc("GetTickCount64")
	procGetLogicalDriveStringsW  = kernel32.NewProc("GetLogicalDriveStringsW")
	procGetDriveTypeW            = kernel32.NewProc("GetDriveTypeW")
	procGetDiskFreeSpaceExW      = kernel32.NewProc("GetDiskFreeSpaceExW")
	procK32GetProcessMemoryInfo  = kernel32.NewProc("K32GetProcessMemoryInfo")
	procGetIfTable2              = iphlpapi.NewProc("GetIfTable2")
	procFreeMibTable             = iphlpapi.NewProc("FreeMibTable")
)

const (
	systemProcessorPerformanceInformation = 8
	processQueryLimitedInformation        = 0x1000
	processTerminate                      = 0x0001
	ioctlDiskPerformance                  = 0x70020
	driveFixed                            = 3
	ifOperStatusUp                        = 1
	ifFlagHardware                        = 0x1
	ifFlagFilter                          = 0x2
	maxPhysicalDrives                     = 16
	// Windows CPU and process times are 100ns units.
	filetimeNs = 100
)

// SYSTEM_PROCESSOR_PERFORMANCE_INFORMATION. KernelTime includes IdleTime.
type processorPerf struct {
	IdleTime       int64
	KernelTime     int64
	UserTime       int64
	DpcTime        int64
	InterruptTime  int64
	InterruptCount uint32
	_              uint32
}

type memoryStatusEx struct {
	Length               uint32
	MemoryLoad           uint32
	TotalPhys            uint64
	AvailPhys            uint64
	TotalPageFile        uint64
	AvailPageFile        uint64
	TotalVirtual         uint64
	AvailVirtual         uint64
	AvailExtendedVirtual uint64
}

type processMemoryCounters struct {
	Cb                         uint32
	PageFaultCount             uint32
	PeakWorkingSetSize         uintptr
	WorkingSetSize             uintptr
	QuotaPeakPagedPoolUsage    uintptr
	QuotaPagedPoolUsage        uintptr
	QuotaPeakNonPagedPoolUsage uintptr
	QuotaNonPagedPoolUsage     uintptr
	PagefileUsage              uintptr
	PeakPagefileUsage          uintptr
}

type diskPerformance struct {
	BytesRead           int64
	BytesWritten        int64
	ReadTime            int64
	WriteTime           int64
	IdleTime            int64
	ReadCount           uint32
	WriteCount          uint32
	QueueDepth          uint32
	SplitCount          uint32
	QueryTime           int64
	StorageDeviceNumber uint32
	StorageManagerName  [8]uint16
}

type osVersionInfo struct {
	Size         uint32
	MajorVersion uint32
	MinorVersion uint32
	BuildNumber  uint32
	PlatformID   uint32
	CSDVersion   [128]uint16
}

// MIB_IF_ROW2 (netioapi.h). The layout is checked against sizeof below.
type mibIfRow2 struct {
	InterfaceLuid               uint64
	InterfaceIndex              uint32
	InterfaceGUID               [16]byte
	Alias                       [257]uint16
	Description                 [257]uint16
	PhysicalAddressLength       uint32
	PhysicalAddress             [32]byte
	PermanentPhysicalAddress    [32]byte
	Mtu                         uint32
	Type                        uint32
	TunnelType                  uint32
	MediaType                   uint32
	PhysicalMediumType          uint32
	AccessType                  uint32
	DirectionType               uint32
	InterfaceAndOperStatusFlags uint8
	OperStatus                  uint32
	AdminStatus                 uint32
	MediaConnectState           uint32
	NetworkGUID                 [16]byte
	ConnectionType              uint32
	TransmitLinkSpeed           uint64
	ReceiveLinkSpeed            uint64
	InOctets                    uint64
	InUcastPkts                 uint64
	InNUcastPkts                uint64
	InDiscards                  uint64
	InErrors                    uint64
	InUnknownProtos             uint64
	InUcastOctets               uint64
	InMulticastOctets           uint64
	InBroadcastOctets           uint64
	OutOctets                   uint64
	OutUcastPkts                uint64
	OutNUcastPkts               uint64
	OutDiscards                 uint64
	OutErrors                   uint64
	OutUcastOctets              uint64
	OutMulticastOctets          uint64
	OutBroadcastOctets          uint64
	OutQLen                     uint64
}

var _ [1352]byte = [unsafe.Sizeof(mibIfRow2{})]byte{}
var _ [88]byte = [unsafe.Sizeof(diskPerformance{})]byte{}

type procOwner struct {
	created uint64
	user    string
}

type host struct {
	start    time.Time
	gpu      bool
	perf     []processorPerf
	owners   map[int]procOwner
	drives   map[int]syscall.Handle
	lastScan time.Time
}

func runAgent(ctx context.Context, in io.Reader, out io.Writer) error {
	h := &host{
		start:  time.Now(),
		gpu:    hasNvidiaSMI(),
		perf:   make([]processorPerf, 256),
		owners: map[int]procOwner{},
		drives: map[int]syscall.Handle{},
	}
	defer h.close()
	tk := time.NewTicker(fastEvery)
	defer tk.Stop()
	return serve(ctx, in, out, h, tk.C)
}

func (h *host) close() {
	for i, hd := range h.drives {
		_ = syscall.CloseHandle(hd)
		delete(h.drives, i)
	}
}

func (h *host) hello() helloMsg {
	name, err := os.Hostname()
	if err != nil || name == "" {
		name = "unknown"
	}
	kernel := "Windows"
	v := osVersionInfo{Size: uint32(unsafe.Sizeof(osVersionInfo{}))}
	if r, _, _ := procRtlGetVersion.Call(uintptr(unsafe.Pointer(&v))); r == 0 {
		kernel = fmt.Sprintf("Windows %d.%d.%d", v.MajorVersion, v.MinorVersion, v.BuildNumber)
	}
	return helloMsg{
		Type: "hello", V: protocolVersion, AgentVersion: agentVersion,
		Arch: runtime.GOARCH, Hostname: name, Kernel: kernel, CPUCount: runtime.NumCPU(),
	}
}

func (h *host) gpuEnabled() bool { return h.gpu }

func (h *host) sampleGPUs() ([]gpuMsg, error) { return sampleNvidiaSMI() }

// Thermal zones need WMI (MSAcpi_ThermalZoneTemperature) with elevation and
// are rarely populated; none are reported.
func (h *host) sampleThermals() ([]thermalMsg, error) { return []thermalMsg{}, nil }

func (h *host) sampleFast() fastRaw {
	raw := fastRaw{When: time.Now(), Mono: time.Since(h.start)}

	if cpus, err := h.cpuSamples(); err != nil {
		raw.CPUWarn = err.Error()
	} else {
		raw.CPUs = cpus
	}
	if mem, err := windowsMemory(); err != nil {
		raw.MemWarn = err.Error()
	} else {
		raw.Mem = mem
	}
	if nets, err := windowsNets(); err != nil {
		raw.NetWarn = err.Error()
	} else {
		raw.Nets = nets
	}
	// Windows has no load average; the card shows zeros.
	ms, _, _ := procGetTickCount64.Call()
	raw.Uptime = float64(ms) / 1000
	raw.Disks = h.diskSamples(raw.When)
	return raw
}

// Only the calling thread's processor group is returned, so hosts with more
// than 64 logical processors report their first group.
func (h *host) cpuSamples() ([]metrics.CPUSample, error) {
	size := uint32(len(h.perf)) * uint32(unsafe.Sizeof(processorPerf{}))
	var ret uint32
	r, _, _ := procNtQuerySystemInformation.Call(
		systemProcessorPerformanceInformation,
		uintptr(unsafe.Pointer(&h.perf[0])), uintptr(size), uintptr(unsafe.Pointer(&ret)))
	if r != 0 {
		return nil, fmt.Errorf("NtQuerySystemInformation: 0x%x", r)
	}
	n := int(ret / uint32(unsafe.Sizeof(processorPerf{})))
	out := make([]metrics.CPUSample, 0, n+1)
	agg := metrics.CPUSample{Name: "cpu"}
	for i, p := range h.perf[:n] {
		system := p.KernelTime - p.IdleTime
		if system < 0 {
			system = 0
		}
		s := metrics.CPUSample{
			Name: "cpu" + strconv.Itoa(i),
			User: uint64(p.UserTime), System: uint64(system), Idle: uint64(p.IdleTime),
		}
		agg.User += s.User
		agg.System += s.System
		agg.Idle += s.Idle
		out = append(out, s)
	}
	return append([]metrics.CPUSample{agg}, out...), nil
}

// Swap is the page file: its size is TotalPageFile - TotalPhys and its use
// is the commit charge above physical use. This is an estimate; Windows does
// not expose page file occupancy through this call.
func windowsMemory() (metrics.Memory, error) {
	m := memoryStatusEx{Length: uint32(unsafe.Sizeof(memoryStatusEx{}))}
	if r, _, err := procGlobalMemoryStatusEx.Call(uintptr(unsafe.Pointer(&m))); r == 0 {
		return metrics.Memory{}, err
	}
	used := m.TotalPhys - m.AvailPhys
	var swapTotal, swapUsed uint64
	if m.TotalPageFile > m.TotalPhys {
		swapTotal = m.TotalPageFile - m.TotalPhys
	}
	if commit := m.TotalPageFile - m.AvailPageFile; commit > used {
		swapUsed = commit - used
	}
	if swapUsed > swapTotal {
		swapUsed = swapTotal
	}
	return metrics.Memory{
		TotalKb: m.TotalPhys / 1024, AvailableKb: m.AvailPhys / 1024, UsedKb: used / 1024,
		SwapTotalKb: swapTotal / 1024, SwapFreeKb: (swapTotal - swapUsed) / 1024, SwapUsedKb: swapUsed / 1024,
	}, nil
}

// Hardware interfaces that are up. Filter-driver rows (WFP, QoS) duplicate
// the adapter they sit on and are skipped.
func windowsNets() ([]metrics.NetSample, error) {
	var table unsafe.Pointer
	if r, _, _ := procGetIfTable2.Call(uintptr(unsafe.Pointer(&table))); r != 0 {
		return nil, fmt.Errorf("GetIfTable2: %d", r)
	}
	defer procFreeMibTable.Call(uintptr(table))
	count := *(*uint32)(table)
	// MIB_IF_TABLE2.Table follows NumEntries at the row alignment (8).
	rows := unsafe.Slice((*mibIfRow2)(unsafe.Add(table, 8)), count)
	out := make([]metrics.NetSample, 0, 4)
	for i := range rows {
		r := &rows[i]
		flags := r.InterfaceAndOperStatusFlags
		if flags&ifFlagHardware == 0 || flags&ifFlagFilter != 0 || r.OperStatus != ifOperStatusUp {
			continue
		}
		out = append(out, metrics.NetSample{
			Name: syscall.UTF16ToString(r.Alias[:]), RX: r.InOctets, TX: r.OutOctets,
		})
	}
	return out, nil
}

// Physical drive handles stay open; missing indexes are probed again every
// slowEvery. Busy time is QueryTime - IdleTime, both in 100ns units.
func (h *host) diskSamples(now time.Time) []metrics.DiskSample {
	if now.Sub(h.lastScan) >= slowEvery {
		h.lastScan = now
		for i := 0; i < maxPhysicalDrives; i++ {
			if _, ok := h.drives[i]; ok {
				continue
			}
			path, _ := syscall.UTF16PtrFromString(`\\.\PhysicalDrive` + strconv.Itoa(i))
			hd, err := syscall.CreateFile(path, 0, syscall.FILE_SHARE_READ|syscall.FILE_SHARE_WRITE, nil, syscall.OPEN_EXISTING, 0, 0)
			if err == nil {
				h.drives[i] = hd
			}
		}
	}
	out := make([]metrics.DiskSample, 0, len(h.drives))
	for i := 0; i < maxPhysicalDrives; i++ {
		hd, ok := h.drives[i]
		if !ok {
			continue
		}
		var perf diskPerformance
		var ret uint32
		err := syscall.DeviceIoControl(hd, ioctlDiskPerformance, nil, 0,
			(*byte)(unsafe.Pointer(&perf)), uint32(unsafe.Sizeof(perf)), &ret, nil)
		if err != nil {
			_ = syscall.CloseHandle(hd)
			delete(h.drives, i)
			continue
		}
		busy := perf.QueryTime - perf.IdleTime
		if busy < 0 {
			busy = 0
		}
		out = append(out, metrics.DiskSample{
			Device:       "PhysicalDrive" + strconv.Itoa(i),
			ReadSectors:  uint64(perf.BytesRead) / metrics.SectorSize,
			WriteSectors: uint64(perf.BytesWritten) / metrics.SectorSize,
			IOTimeMs:     uint64(busy) * filetimeNs / 1_000_000,
		})
	}
	return out
}

func (h *host) sampleDisks() ([]diskMsg, error) {
	buf := make([]uint16, 512)
	n, _, err := procGetLogicalDriveStringsW.Call(uintptr(len(buf)), uintptr(unsafe.Pointer(&buf[0])))
	if n == 0 || int(n) > len(buf) {
		return nil, err
	}
	out := make([]diskMsg, 0, 4)
	for start := 0; start < int(n); {
		end := start
		for end < int(n) && buf[end] != 0 {
			end++
		}
		if end == start {
			break
		}
		root := buf[start : end+1]
		start = end + 1
		if t, _, _ := procGetDriveTypeW.Call(uintptr(unsafe.Pointer(&root[0]))); t != driveFixed {
			continue
		}
		var avail, total, free uint64
		if r, _, _ := procGetDiskFreeSpaceExW.Call(uintptr(unsafe.Pointer(&root[0])),
			uintptr(unsafe.Pointer(&avail)), uintptr(unsafe.Pointer(&total)), uintptr(unsafe.Pointer(&free))); r == 0 {
			continue
		}
		mount := syscall.UTF16ToString(root)
		u := metrics.Usage(total, free, avail, 1)
		out = append(out, diskMsg{
			Filesystem: mount[:len(mount)-1], SizeKb: u.SizeKb, UsedKb: u.UsedKb,
			AvailKb: u.AvailKb, UsePercent: u.UsePercent, MountPoint: mount,
		})
	}
	return out, nil
}

// Processes the agent cannot open (protected, or another user's without
// elevation) are skipped.
func (h *host) sampleProcs(_ uint64) ([]metrics.ProcessSample, error) {
	snap, err := syscall.CreateToolhelp32Snapshot(syscall.TH32CS_SNAPPROCESS, 0)
	if err != nil {
		return nil, err
	}
	defer syscall.CloseHandle(snap)
	var entry syscall.ProcessEntry32
	entry.Size = uint32(unsafe.Sizeof(entry))
	seen := make(map[int]procOwner, len(h.owners))
	out := make([]metrics.ProcessSample, 0, 128)
	for err = syscall.Process32First(snap, &entry); err == nil; err = syscall.Process32Next(snap, &entry) {
		pid := int(entry.ProcessID)
		if pid == 0 {
			continue
		}
		hd, oerr := syscall.OpenProcess(processQueryLimitedInformation, false, entry.ProcessID)
		if oerr != nil {
			continue
		}
		var created, exited, kernel, user syscall.Filetime
		if syscall.GetProcessTimes(hd, &created, &exited, &kernel, &user) != nil {
			_ = syscall.CloseHandle(hd)
			continue
		}
		var mem processMemoryCounters
		mem.Cb = uint32(unsafe.Sizeof(mem))
		procK32GetProcessMemoryInfo.Call(uintptr(hd), uintptr(unsafe.Pointer(&mem)), uintptr(mem.Cb))

		createdAt := filetime(created)
		owner, ok := h.owners[pid]
		if !ok || owner.created != createdAt {
			owner = procOwner{created: createdAt, user: processUser(hd)}
		}
		seen[pid] = owner
		_ = syscall.CloseHandle(hd)

		out = append(out, metrics.ProcessSample{
			PID: pid, User: owner.user, Command: syscall.UTF16ToString(entry.ExeFile[:]),
			CPUNs: (filetime(kernel) + filetime(user)) * filetimeNs, RSSBytes: uint64(mem.WorkingSetSize),
		})
	}
	h.owners = seen
	return out, nil
}

func filetime(ft syscall.Filetime) uint64 {
	return uint64(ft.HighDateTime)<<32 | uint64(ft.LowDateTime)
}

func processSID(hd syscall.Handle) (*syscall.Tokenuser, error) {
	var tok syscall.Token
	if err := syscall.OpenProcessToken(hd, syscall.TOKEN_QUERY, &tok); err != nil {
		return nil, err
	}
	defer tok.Close()
	return tok.GetTokenUser()
}

func processUser(hd syscall.Handle) string {
	tu, err := processSID(hd)
	if err != nil {
		return "?"
	}
	account, _, _, err := tu.User.Sid.LookupAccount("")
	if err != nil || account == "" {
		if s, serr := tu.User.Sid.String(); serr == nil {
			return s
		}
		return "?"
	}
	return account
}

// Windows has no TERM: both signals terminate the process. Ownership is the
// token user SID, compared with the agent's own.
func (h *host) kill(pid int, sig string) error {
	owner, ownerErr := sameOwner(pid)
	if err := authorizeKill(pid, 0, owner, ownerErr, sig); err != nil {
		return err
	}
	hd, err := syscall.OpenProcess(processTerminate, false, uint32(pid))
	if err != nil {
		return err
	}
	defer syscall.CloseHandle(hd)
	return syscall.TerminateProcess(hd, 1)
}

// sameOwner returns 0 when pid runs as the agent's user and 1 otherwise, in
// the uid shape authorizeKill expects.
func sameOwner(pid int) (int, error) {
	self, err := syscall.GetCurrentProcess()
	if err != nil {
		return 0, err
	}
	mine, err := processSID(self)
	if err != nil {
		return 0, err
	}
	hd, err := syscall.OpenProcess(processQueryLimitedInformation, false, uint32(pid))
	if err != nil {
		return 0, errors.New("process not found")
	}
	defer syscall.CloseHandle(hd)
	theirs, err := processSID(hd)
	if err != nil {
		return 0, err
	}
	a, _ := mine.User.Sid.String()
	b, _ := theirs.User.Sid.String()
	if a == "" || a != b {
		return 1, nil
	}
	return 0, nil
}
