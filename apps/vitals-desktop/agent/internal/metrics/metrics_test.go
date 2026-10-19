package metrics

import (
	"math"
	"os"
	"testing"
)

func readFixture(t *testing.T, name string) string {
	t.Helper()
	b, err := os.ReadFile("testdata/" + name)
	if err != nil {
		t.Fatal(err)
	}
	return string(b)
}

func near(t *testing.T, got, want float64) {
	t.Helper()
	if math.Abs(got-want) > 1e-6 {
		t.Fatalf("got %v want %v", got, want)
	}
}

func TestCPUDeltas(t *testing.T) {
	prev := ParseProcStat(readFixture(t, "stat_prev.txt"))
	curr := ParseProcStat(readFixture(t, "stat_curr.txt"))
	reset := ParseProcStat(readFixture(t, "stat_reset.txt"))

	if CPUCount(prev) != 2 {
		t.Fatalf("cpu count %d", CPUCount(prev))
	}

	tests := []struct {
		name      string
		prev, cur []CPUSample
		total     float64
		cores     int
		core0     float64
	}{
		{name: "half busy", prev: prev, cur: curr, total: 50, cores: 2, core0: 50},
		{name: "counter reset", prev: prev, cur: reset, total: 0, cores: 2, core0: 0},
		{name: "first sample", prev: nil, cur: curr, total: 0, cores: 2, core0: 0},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			total, cores := CPUUsage(tt.prev, tt.cur)
			near(t, total, tt.total)
			if len(cores) != tt.cores {
				t.Fatalf("cores %d", len(cores))
			}
			near(t, cores[0].UsagePercent, tt.core0)
			if cores[0].Name != "cpu0" || cores[1].Name != "cpu1" {
				t.Fatalf("names %s %s", cores[0].Name, cores[1].Name)
			}
		})
	}
}

func TestMeminfo(t *testing.T) {
	got := ParseMeminfo(readFixture(t, "meminfo.txt"))
	want := Memory{
		TotalKb: 8000000, AvailableKb: 3000000, UsedKb: 5000000,
		SwapTotalKb: 1000000, SwapFreeKb: 250000, SwapUsedKb: 750000,
	}
	if got != want {
		t.Fatalf("got %+v", got)
	}
}

func TestNetRates(t *testing.T) {
	keep := func(name string) bool {
		return KeepIface(name, name == "eth0" || name == "eth1" || name == "tailscale0")
	}
	prev := FilterNet(ParseNetDev(readFixture(t, "netdev_prev.txt")), keep)
	curr := FilterNet(ParseNetDev(readFixture(t, "netdev_curr.txt")), keep)
	reset := FilterNet(ParseNetDev(readFixture(t, "netdev_reset.txt")), keep)

	if len(prev) != 2 || prev[0].Name != "eth0" {
		t.Fatalf("filter kept %+v", prev)
	}

	tests := []struct {
		name    string
		prev    []NetSample
		curr    []NetSample
		elapsed float64
		want    []NetRate
	}{
		{
			name: "delta", prev: prev, curr: curr, elapsed: 2,
			want: []NetRate{
				{Name: "eth0", RXBytesPerSec: 2000, TXBytesPerSec: 0},
				{Name: "eth1", RXBytesPerSec: 0, TXBytesPerSec: 1000},
			},
		},
		{
			name: "counter reset", prev: prev, curr: reset, elapsed: 2,
			want: []NetRate{
				{Name: "eth0", RXBytesPerSec: 50, TXBytesPerSec: 25},
				{Name: "eth1", RXBytesPerSec: 25, TXBytesPerSec: 12.5},
			},
		},
		{
			name: "zero elapsed", prev: prev, curr: curr, elapsed: 0,
			want: []NetRate{
				{Name: "eth0"},
				{Name: "eth1"},
			},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := NetRates(tt.prev, tt.curr, tt.elapsed)
			if len(got) != len(tt.want) {
				t.Fatalf("len %d", len(got))
			}
			for i := range got {
				if got[i].Name != tt.want[i].Name {
					t.Fatalf("name %s", got[i].Name)
				}
				near(t, got[i].RXBytesPerSec, tt.want[i].RXBytesPerSec)
				near(t, got[i].TXBytesPerSec, tt.want[i].TXBytesPerSec)
			}
		})
	}

	if KeepIface("tailscale0", false) {
		t.Fatal("tun without a device link must be dropped")
	}
	if !KeepIface("tailscale0", true) {
		t.Fatal("a device link is physical even for an unexpected name")
	}
}

func TestDiskRates(t *testing.T) {
	whole := func(name string) bool { return LooksLikeWholeDisk(name) }
	prev := FilterDisks(ParseDiskstats(readFixture(t, "diskstats_prev.txt")), whole)
	curr := FilterDisks(ParseDiskstats(readFixture(t, "diskstats_curr.txt")), whole)
	reset := FilterDisks(ParseDiskstats(readFixture(t, "diskstats_reset.txt")), whole)

	if len(prev) != 2 || prev[0].Device != "sda" || prev[1].Device != "nvme0n1" {
		t.Fatalf("whole disks %+v", prev)
	}

	tests := []struct {
		name    string
		prev    []DiskSample
		curr    []DiskSample
		elapsed float64
		read0   float64
		write0  float64
		util0   float64
	}{
		{name: "delta", prev: prev, curr: curr, elapsed: 1, read0: 2000 * SectorSize, write0: 0, util0: 50},
		{name: "counter reset", prev: prev, curr: reset, elapsed: 1, read0: 10 * SectorSize, write0: 4 * SectorSize, util0: 25},
		{name: "zero elapsed", prev: prev, curr: curr, elapsed: 0, read0: 0, write0: 0, util0: 0},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := DiskRates(tt.prev, tt.curr, tt.elapsed)
			if len(got) != 2 || got[0].Device != "sda" {
				t.Fatalf("%+v", got)
			}
			near(t, got[0].ReadBytesPerSec, tt.read0)
			near(t, got[0].WriteBytesPerSec, tt.write0)
			near(t, got[0].UtilPercent, tt.util0)
		})
	}

	// util is capped when io time exceeds the interval
	over := DiskRates(
		[]DiskSample{{Device: "sda", IOTimeMs: 0}},
		[]DiskSample{{Device: "sda", IOTimeMs: 5000}},
		1,
	)
	near(t, over[0].UtilPercent, 100)
}

func TestPressure(t *testing.T) {
	cpu, ok := ParsePSIAvg10(readFixture(t, "pressure_cpu.txt"))
	if !ok {
		t.Fatal("cpu")
	}
	mem, ok := ParsePSIAvg10(readFixture(t, "pressure_memory.txt"))
	if !ok {
		t.Fatal("memory")
	}
	io, ok := ParsePSIAvg10(readFixture(t, "pressure_io.txt"))
	if !ok {
		t.Fatal("io")
	}
	near(t, cpu, 1.25)
	near(t, mem, 2.50)
	near(t, io, 0)
	if _, ok := ParsePSIAvg10("full avg10=9.00 avg60=0 total=1\n"); ok {
		t.Fatal("full line must not be used")
	}
}

func TestProcessDeltas(t *testing.T) {
	first, err := ParsePIDStat(readFixture(t, "pid_stat.txt"))
	if err != nil {
		t.Fatal(err)
	}
	rewound, err := ParsePIDStat(readFixture(t, "pid_stat_reset.txt"))
	if err != nil {
		t.Fatal(err)
	}
	if first.PID != 42 || first.Command != "nginx worker" || first.Ticks() != 3000 || first.RSSPages != 7 {
		t.Fatalf("%+v", first)
	}
	uid, err := ParseStatusUID(readFixture(t, "pid_status.txt"))
	if err != nil || uid != 1000 {
		t.Fatalf("uid %d %v", uid, err)
	}

	const tickNs = 10_000_000 // USER_HZ 100
	const page = 4096
	base := first.Ticks() * tickNs
	samples := []ProcessSample{{
		PID: first.PID, User: "www", Command: first.Command,
		CPUNs: rewound.Ticks() * tickNs, RSSBytes: rewound.RSSPages * page,
	}}

	tests := []struct {
		name    string
		prev    map[int]uint64
		elapsed float64
		cpu     float64
	}{
		{name: "first sight", prev: nil, elapsed: 1, cpu: 0},
		{name: "delta", prev: map[int]uint64{42: 2500 * tickNs}, elapsed: 1, cpu: 500},
		{name: "counter reset", prev: map[int]uint64{42: base}, elapsed: 1, cpu: 150},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// delta case uses the higher tick sample
			in := samples
			if tt.name == "delta" {
				in = []ProcessSample{{
					PID: 42, User: "www", Command: "nginx worker",
					CPUNs: first.Ticks() * tickNs, RSSBytes: first.RSSPages * page,
				}}
			}
			rows, next := RankProcesses(in, tt.prev, tt.elapsed, 8000000*1024, 25)
			if len(rows) != 1 {
				t.Fatalf("rows %d", len(rows))
			}
			near(t, rows[0].CPUPercent, tt.cpu)
			if next[42] != in[0].CPUNs {
				t.Fatalf("baseline %d", next[42])
			}
			if tt.name == "delta" {
				near(t, rows[0].MemPercent, float64(7*page)/float64(8000000*1024)*100)
			}
		})
	}

	many := make([]ProcessSample, 30)
	for i := range many {
		many[i] = ProcessSample{PID: i + 2, User: "u", Command: "c", CPUNs: uint64(100+i) * tickNs}
	}
	prev := map[int]uint64{}
	for i := range many {
		prev[many[i].PID] = 100 * tickNs
	}
	rows, next := RankProcesses(many, prev, 1, 1, 25)
	if len(rows) != 25 || len(next) != 30 {
		t.Fatalf("top %d baseline %d", len(rows), len(next))
	}
	if rows[0].PID != 31 {
		t.Fatalf("highest cpu pid %d", rows[0].PID)
	}
}

func TestMountsAndUsage(t *testing.T) {
	text := "" +
		"/dev/sda1 / ext4 rw 0 0\n" +
		"proc /proc proc rw 0 0\n" +
		"tmpfs /run tmpfs rw 0 0\n" +
		"/dev/sdb1 /mnt/My\\040Disk xfs rw 0 0\n" +
		"overlay /var/lib/docker/overlay2 overlay rw 0 0\n"
	got := ParseMounts(text)
	if len(got) != 3 {
		t.Fatalf("%+v", got)
	}
	if got[1].MountPoint != "/mnt/My Disk" || got[1].FSType != "xfs" {
		t.Fatalf("%+v", got[1])
	}
	if got[2].FSType != "overlay" {
		t.Fatalf("%+v", got[2])
	}
	u := Usage(1000, 400, 500, 4096)
	if u.SizeKb != 4000 || u.UsedKb != 2400 || u.AvailKb != 2000 {
		t.Fatalf("%+v", u)
	}
	near(t, u.UsePercent, 60)
}

func TestLoadUptimeThermalGPU(t *testing.T) {
	load, ok := ParseLoadavg("0.15 0.10 0.05 1/100 12\n")
	if !ok || load != [3]float64{0.15, 0.10, 0.05} {
		t.Fatalf("%v %v", load, ok)
	}
	up, ok := ParseUptime("12345.5 999.0\n")
	if !ok || up != 12345.5 {
		t.Fatalf("%v", up)
	}
	c, err := MilliCelsius("45123\n")
	if err != nil {
		t.Fatal(err)
	}
	near(t, c, 45.123)
	gpus := ParseNvidiaSMI("0, NVIDIA T4, 55, 10, 100, 8192\n")
	if len(gpus) != 1 || gpus[0].Name != "NVIDIA T4" || gpus[0].MemoryTotalMb != 8192 {
		t.Fatalf("%+v", gpus)
	}
}
