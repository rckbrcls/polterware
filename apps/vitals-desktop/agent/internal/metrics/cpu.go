package metrics

import (
	"strings"
)

// CPUSample is one cpu line from /proc/stat. Guest and guestNice are parsed
// for completeness but are not added into busy time: Linux already counts
// them inside user and nice (proc(5)).
type CPUSample struct {
	Name                string
	User, Nice, System  uint64
	Idle, IOWait        uint64
	IRQ, SoftIRQ, Steal uint64
	Guest, GuestNice    uint64
}

type CoreUsage struct {
	Name         string
	UsagePercent float64
}

func ParseProcStat(text string) []CPUSample {
	var out []CPUSample
	for _, line := range strings.Split(text, "\n") {
		fields := strings.Fields(line)
		if len(fields) < 5 || !strings.HasPrefix(fields[0], "cpu") {
			continue
		}
		nums := make([]uint64, 10)
		for i := 0; i < len(nums) && i+1 < len(fields); i++ {
			nums[i] = parseU64(fields[i+1])
		}
		out = append(out, CPUSample{
			Name:      fields[0],
			User:      nums[0],
			Nice:      nums[1],
			System:    nums[2],
			Idle:      nums[3],
			IOWait:    nums[4],
			IRQ:       nums[5],
			SoftIRQ:   nums[6],
			Steal:     nums[7],
			Guest:     nums[8],
			GuestNice: nums[9],
		})
	}
	return out
}

func (s CPUSample) busy() uint64 {
	return s.User + s.Nice + s.System + s.IRQ + s.SoftIRQ + s.Steal
}

func (s CPUSample) total() uint64 {
	return s.busy() + s.Idle + s.IOWait
}

// CPUUsage returns total and per-core percentages between two /proc/stat
// samples. elapsedSec <= 0, a missing previous line, or a backwards tick
// total yields 0. Aggregate CPU counters are not rebased on reset because a
// partial rewind is not a trustworthy zero point.
func CPUUsage(prev, curr []CPUSample) (total float64, cores []CoreUsage) {
	prevBy := make(map[string]CPUSample, len(prev))
	for _, s := range prev {
		prevBy[s.Name] = s
	}
	cores = make([]CoreUsage, 0, len(curr))
	for _, s := range curr {
		pct := cpuPercent(prevBy, s)
		if s.Name == "cpu" {
			total = pct
			continue
		}
		cores = append(cores, CoreUsage{Name: s.Name, UsagePercent: pct})
	}
	return total, cores
}

func cpuPercent(prevBy map[string]CPUSample, curr CPUSample) float64 {
	prev, ok := prevBy[curr.Name]
	if !ok {
		return 0
	}
	pt, ct := prev.total(), curr.total()
	pb, cb := prev.busy(), curr.busy()
	if ct < pt || cb < pb || ct == pt {
		return 0
	}
	return float64(cb-pb) / float64(ct-pt) * 100
}

func CPUCount(samples []CPUSample) int {
	n := 0
	for _, s := range samples {
		if s.Name != "cpu" && strings.HasPrefix(s.Name, "cpu") {
			n++
		}
	}
	return n
}
