package main

import (
	"bufio"
	"context"
	"encoding/json"
	"io"
	"testing"
	"time"

	"github.com/polterware/polterware/apps/vitals-desktop/agent/internal/metrics"
)

type fakeCollector struct {
	fast []fastRaw
	n    int
	gpu  bool
}

func (f *fakeCollector) hello() helloMsg {
	return helloMsg{
		Type: "hello", V: protocolVersion, AgentVersion: agentVersion,
		Arch: "amd64", Hostname: "box", Kernel: "6.8.0", CPUCount: 2,
	}
}

func (f *fakeCollector) sampleFast() fastRaw {
	if f.n >= len(f.fast) {
		return f.fast[len(f.fast)-1]
	}
	s := f.fast[f.n]
	f.n++
	return s
}

func (f *fakeCollector) sampleProcs(uint64) ([]metrics.ProcessSample, error) {
	return []metrics.ProcessSample{{PID: 42, User: "www", Command: "nginx", CPUNs: 1_000_000_000, RSSBytes: 4096}}, nil
}

func (f *fakeCollector) sampleDisks() ([]diskMsg, error) {
	return []diskMsg{{Filesystem: "/dev/sda1", SizeKb: 100, UsedKb: 40, AvailKb: 60, UsePercent: 40, MountPoint: "/"}}, nil
}

func (f *fakeCollector) sampleThermals() ([]thermalMsg, error) {
	return []thermalMsg{{ID: "thermal_zone0", Celsius: 45}}, nil
}

func (f *fakeCollector) sampleGPUs() ([]gpuMsg, error) {
	return []gpuMsg{{Index: 0, Name: "T4", TemperatureC: 50, UtilizationPercent: 1, MemoryUsedMb: 10, MemoryTotalMb: 100}}, nil
}

func (f *fakeCollector) gpuEnabled() bool { return f.gpu }

func (f *fakeCollector) kill(pid int, sig string) error {
	return authorizeKill(pid, 10, 10, nil, sig)
}

func readJSON(t *testing.T, r *bufio.Reader) map[string]json.RawMessage {
	t.Helper()
	type result struct {
		line []byte
		err  error
	}
	ch := make(chan result, 1)
	go func() {
		line, err := r.ReadBytes('\n')
		ch <- result{line, err}
	}()
	select {
	case res := <-ch:
		if res.err != nil {
			t.Fatal(res.err)
		}
		var m map[string]json.RawMessage
		if err := json.Unmarshal(res.line, &m); err != nil {
			t.Fatalf("unmarshal %s: %v", res.line, err)
		}
		return m
	case <-time.After(2 * time.Second):
		t.Fatal("timeout waiting for frame")
		return nil
	}
}

func TestServeOmitsSlowFieldsUntilRecollected(t *testing.T) {
	when := time.UnixMilli(1_700_000_000_000)
	cpu := func(user, idle uint64, mono time.Duration) fastRaw {
		return fastRaw{
			When: when, Mono: mono,
			CPUs: []metrics.CPUSample{
				{Name: "cpu", User: user, Idle: idle},
				{Name: "cpu0", User: user, Idle: idle},
			},
			Mem:      metrics.Memory{TotalKb: 1000, AvailableKb: 400, UsedKb: 600},
			Nets:     []metrics.NetSample{{Name: "eth0", RX: 1000 + uint64(mono/time.Second)*100, TX: 50}},
			Load:     [3]float64{0.1, 0.2, 0.3},
			Uptime:   10,
			Disks:    []metrics.DiskSample{{Device: "sda", ReadSectors: 10, WriteSectors: 4, IOTimeMs: 10}},
			Pressure: &metrics.Pressure{CPU: 1, Memory: 2, IO: 3},
		}
	}
	fc := &fakeCollector{fast: []fastRaw{
		cpu(0, 100, 0),
		cpu(50, 150, time.Second),
		cpu(50, 150, 2*time.Second),
	}, gpu: true}

	inR, inW := io.Pipe()
	outR, outW := io.Pipe()
	defer inW.Close()
	defer outW.Close()
	ticks := make(chan time.Time)
	errc := make(chan error, 1)
	go func() {
		errc <- serve(context.Background(), inR, outW, fc, ticks)
	}()
	rd := bufio.NewReader(outR)

	hello := readJSON(t, rd)
	if string(hello["type"]) != `"hello"` || string(hello["v"]) != "1" {
		t.Fatalf("hello %s", hello)
	}

	ticks <- when
	first := readJSON(t, rd)
	for _, key := range []string{"disks", "processes", "thermals", "gpus", "pressure", "diskIo"} {
		if _, ok := first[key]; !ok {
			t.Fatalf("first frame missing %s: %s", key, first)
		}
	}
	var cpuPct float64
	if err := json.Unmarshal(first["cpuTotalPercent"], &cpuPct); err != nil || cpuPct != 0 {
		t.Fatalf("first cpu %s", first["cpuTotalPercent"])
	}

	ticks <- when
	second := readJSON(t, rd)
	for _, key := range []string{"disks", "processes", "thermals", "gpus"} {
		if _, ok := second[key]; ok {
			t.Fatalf("second frame included %s", key)
		}
	}
	if _, ok := second["pressure"]; !ok {
		t.Fatal("pressure is fast")
	}
	if err := json.Unmarshal(second["cpuTotalPercent"], &cpuPct); err != nil || cpuPct != 50 {
		t.Fatalf("second cpu %s", second["cpuTotalPercent"])
	}

	if _, err := inW.Write([]byte("{\"cmd\":\"ping\"}\n")); err != nil {
		t.Fatal(err)
	}
	pong := readJSON(t, rd)
	if string(pong["type"]) != `"pong"` {
		t.Fatalf("pong %s", pong)
	}

	if err := inW.Close(); err != nil {
		t.Fatal(err)
	}
	select {
	case err := <-errc:
		if err != nil {
			t.Fatal(err)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("serve did not exit on stdin EOF")
	}
}

func TestServeWarnIsRateLimited(t *testing.T) {
	warnSample := func(mono time.Duration) fastRaw {
		return fastRaw{When: time.UnixMilli(1), Mono: mono, CPUWarn: "stat unreadable"}
	}
	fc := &fakeCollector{fast: []fastRaw{
		warnSample(0),
		warnSample(time.Second),
		warnSample(11 * time.Second),
	}}
	inR, inW := io.Pipe()
	outR, outW := io.Pipe()
	defer inW.Close()
	defer outW.Close()
	ticks := make(chan time.Time)
	go func() {
		_ = serve(context.Background(), inR, outW, fc, ticks)
	}()
	rd := bufio.NewReader(outR)
	_ = readJSON(t, rd) // hello

	var warns int
	for i := 0; i < 3; i++ {
		ticks <- time.Unix(0, 0)
		for {
			frame := readJSON(t, rd)
			typ := string(frame["type"])
			if typ == `"warn"` {
				warns++
				continue
			}
			if typ == `"metrics"` {
				break
			}
			t.Fatalf("unexpected %s", frame)
		}
	}
	if warns != 2 {
		t.Fatalf("warns %d", warns)
	}
	_ = inW.Close()
}
