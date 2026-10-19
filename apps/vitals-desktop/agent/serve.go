package main

import (
	"bufio"
	"bytes"
	"context"
	"io"
	"slices"
	"sync"
	"time"

	"github.com/polterware/polterware/apps/vitals-desktop/agent/internal/metrics"
)

const (
	fastEvery  = time.Second
	procEvery  = 2 * time.Second
	gpuEvery   = 3 * time.Second
	slowEvery  = 10 * time.Second
	warnEvery  = 10 * time.Second
	processTop = 25
)

type fastRaw struct {
	When         time.Time
	Mono         time.Duration
	CPUs         []metrics.CPUSample
	CPUWarn      string
	Mem          metrics.Memory
	MemWarn      string
	Nets         []metrics.NetSample
	NetWarn      string
	Load         [3]float64
	LoadWarn     string
	Uptime       float64
	UpWarn       string
	Disks        []metrics.DiskSample
	DiskWarn     string
	Pressure     *metrics.Pressure
	PressureWarn string
}

type collector interface {
	hello() helloMsg
	sampleFast() fastRaw
	sampleProcs(memTotalKb uint64) ([]metrics.ProcessSample, error)
	sampleDisks() ([]diskMsg, error)
	sampleThermals() ([]thermalMsg, error)
	sampleGPUs() ([]gpuMsg, error)
	gpuEnabled() bool
	kill(pid int, signal string) error
}

type rateState struct {
	prevCPU []metrics.CPUSample
	cpu     float64
	cores   []coreMsg

	mem    memMsg
	load   [3]float64
	uptime float64
	psi    *pressureMsg

	haveNet bool
	netMono time.Duration
	prevNet []metrics.NetSample
	net     []netMsg

	haveDiskIO bool
	diskMono   time.Duration
	prevDisk   []metrics.DiskSample
	diskIO     []diskIOMsg

	haveProc  bool
	lastProc  time.Duration
	prevCPUNs map[int]uint64

	haveDisks bool
	lastDisks time.Duration
	haveTherm bool
	lastTherm time.Duration
	haveGPU   bool
	lastGPU   time.Duration
}

type limiter struct {
	mu   sync.Mutex
	last map[string]time.Duration
	gap  time.Duration
}

func (l *limiter) allow(key string, now time.Duration) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	if l.last == nil {
		l.last = map[string]time.Duration{}
	}
	if prev, ok := l.last[key]; ok && now-prev < l.gap {
		return false
	}
	l.last[key] = now
	return true
}

func serve(ctx context.Context, in io.Reader, out io.Writer, c collector, ticks <-chan time.Time) error {
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()

	h := newHub()
	errc := make(chan error, 1)
	go func() { errc <- h.loop(out) }()

	hello, err := marshal(c.hello())
	if err != nil {
		h.close()
		<-errc
		return err
	}
	h.pushCtrl(hello)

	lim := &limiter{gap: warnEvery}
	warn := func(name, message string, now time.Duration) {
		if message == "" || !lim.allow(name, now) {
			return
		}
		if len(message) > 200 {
			message = message[:200]
		}
		b, merr := marshal(warnMsg{Type: "warn", Collector: name, Message: message})
		if merr != nil {
			return
		}
		h.pushCtrl(b)
	}

	go func() {
		readCommands(in, h, c, warn)
		cancel()
	}()

	var st rateState
	for {
		select {
		case <-ctx.Done():
			h.close()
			// A blocked stdout write must not keep the process alive after stdin EOF.
			timer := time.NewTimer(time.Second)
			select {
			case err := <-errc:
				timer.Stop()
				return err
			case <-timer.C:
				return nil
			}
		case err := <-errc:
			cancel()
			return err
		case _, ok := <-ticks:
			if !ok {
				h.close()
				<-errc
				return nil
			}
			if err := emit(c, &st, h, warn); err != nil {
				h.close()
				<-errc
				return err
			}
		}
	}
}

func readCommands(in io.Reader, h *hub, c collector, warn func(string, string, time.Duration)) {
	sc := bufio.NewScanner(in)
	sc.Buffer(make([]byte, 0, 64*1024), 1<<20)
	start := time.Now()
	for sc.Scan() {
		line := bytes.TrimSpace(append([]byte(nil), sc.Bytes()...))
		if len(line) == 0 {
			continue
		}
		resp, msg := dispatch(line, c.kill)
		now := time.Since(start)
		if msg != "" {
			warn("stdin", msg, now)
		}
		if resp != nil {
			h.pushCtrl(resp)
		}
	}
}

func due(have bool, last, now, every time.Duration) bool {
	if !have {
		return true
	}
	return now >= last && now-last >= every
}

func emit(c collector, st *rateState, h *hub, warn func(string, string, time.Duration)) error {
	raw := c.sampleFast()

	if raw.CPUWarn != "" {
		warn("cpu", raw.CPUWarn, raw.Mono)
	} else {
		total, cores := metrics.CPUUsage(st.prevCPU, raw.CPUs)
		st.prevCPU = slices.Clone(raw.CPUs)
		st.cpu = total
		st.cores = make([]coreMsg, len(cores))
		for i, core := range cores {
			st.cores[i] = coreMsg{Name: core.Name, UsagePercent: core.UsagePercent}
		}
	}

	if raw.MemWarn != "" {
		warn("mem", raw.MemWarn, raw.Mono)
	} else {
		m := raw.Mem
		st.mem = memMsg{
			TotalKb: m.TotalKb, AvailableKb: m.AvailableKb, UsedKb: m.UsedKb,
			SwapTotalKb: m.SwapTotalKb, SwapFreeKb: m.SwapFreeKb, SwapUsedKb: m.SwapUsedKb,
		}
	}

	if raw.NetWarn != "" {
		warn("net", raw.NetWarn, raw.Mono)
	} else {
		elapsed := elapsedSince(st.haveNet, st.netMono, raw.Mono)
		rates := metrics.NetRates(st.prevNet, raw.Nets, elapsed)
		st.prevNet = slices.Clone(raw.Nets)
		st.net = make([]netMsg, len(rates))
		for i, r := range rates {
			st.net[i] = netMsg{Name: r.Name, RXBytesPerSec: r.RXBytesPerSec, TXBytesPerSec: r.TXBytesPerSec}
		}
		st.haveNet = true
		st.netMono = raw.Mono
	}

	if raw.DiskWarn != "" {
		warn("diskio", raw.DiskWarn, raw.Mono)
	} else {
		elapsed := elapsedSince(st.haveDiskIO, st.diskMono, raw.Mono)
		rates := metrics.DiskRates(st.prevDisk, raw.Disks, elapsed)
		st.prevDisk = slices.Clone(raw.Disks)
		st.diskIO = make([]diskIOMsg, len(rates))
		for i, r := range rates {
			st.diskIO[i] = diskIOMsg{
				Device: r.Device, ReadBytesPerSec: r.ReadBytesPerSec,
				WriteBytesPerSec: r.WriteBytesPerSec, UtilPercent: r.UtilPercent,
			}
		}
		st.haveDiskIO = true
		st.diskMono = raw.Mono
	}

	if raw.LoadWarn != "" {
		warn("load", raw.LoadWarn, raw.Mono)
	} else {
		st.load = raw.Load
	}
	if raw.UpWarn != "" {
		warn("uptime", raw.UpWarn, raw.Mono)
	} else {
		st.uptime = raw.Uptime
	}
	if raw.PressureWarn != "" {
		warn("pressure", raw.PressureWarn, raw.Mono)
	} else if raw.Pressure != nil {
		p := raw.Pressure
		st.psi = &pressureMsg{CPU: p.CPU, Memory: p.Memory, IO: p.IO}
	} else {
		st.psi = nil
	}

	msg := metricsMsg{
		Type: "metrics", TSUnixMs: raw.When.UnixMilli(), MonoNs: raw.Mono.Nanoseconds(),
		CPU: st.cpu, Cores: st.cores, Load: st.load, Uptime: st.uptime,
		Memory: st.mem, Network: st.net, DiskIO: st.diskIO, Pressure: st.psi,
	}
	if msg.Cores == nil {
		msg.Cores = []coreMsg{}
	}
	if msg.Network == nil {
		msg.Network = []netMsg{}
	}
	if msg.DiskIO == nil {
		msg.DiskIO = []diskIOMsg{}
	}

	if due(st.haveProc, st.lastProc, raw.Mono, procEvery) {
		procs, err := c.sampleProcs(st.mem.TotalKb)
		if err != nil {
			warn("proc", err.Error(), raw.Mono)
		} else {
			elapsed := elapsedSince(st.haveProc, st.lastProc, raw.Mono)
			rows, next := metrics.RankProcesses(procs, st.prevCPUNs, elapsed, st.mem.TotalKb*1024, processTop)
			st.prevCPUNs = next
			out := make([]procMsg, len(rows))
			for i, row := range rows {
				out[i] = procMsg{
					PID: row.PID, User: row.User, CPUPercent: row.CPUPercent,
					MemPercent: row.MemPercent, Command: row.Command,
				}
			}
			msg.Processes = &out
			st.haveProc = true
			st.lastProc = raw.Mono
		}
	}

	if due(st.haveDisks, st.lastDisks, raw.Mono, slowEvery) {
		disks, err := c.sampleDisks()
		if err != nil {
			warn("disk", err.Error(), raw.Mono)
		} else {
			if disks == nil {
				disks = []diskMsg{}
			}
			msg.Disks = &disks
			st.haveDisks = true
			st.lastDisks = raw.Mono
		}
	}

	if due(st.haveTherm, st.lastTherm, raw.Mono, slowEvery) {
		zones, err := c.sampleThermals()
		if err != nil {
			warn("thermal", err.Error(), raw.Mono)
		} else {
			if zones == nil {
				zones = []thermalMsg{}
			}
			msg.Thermals = &zones
			st.haveTherm = true
			st.lastTherm = raw.Mono
		}
	}

	if c.gpuEnabled() && due(st.haveGPU, st.lastGPU, raw.Mono, gpuEvery) {
		gpus, err := c.sampleGPUs()
		if err != nil {
			warn("gpu", err.Error(), raw.Mono)
		} else {
			if gpus == nil {
				gpus = []gpuMsg{}
			}
			msg.GPUs = &gpus
			st.haveGPU = true
			st.lastGPU = raw.Mono
		}
	}

	b, err := marshal(msg)
	if err != nil {
		return err
	}
	h.pushMetric(b)
	return nil
}

func elapsedSince(have bool, last, now time.Duration) float64 {
	if !have || now <= last {
		return 0
	}
	return float64(now-last) / float64(time.Second)
}
