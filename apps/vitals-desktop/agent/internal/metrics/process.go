package metrics

import (
	"errors"
	"sort"
	"strconv"
	"strings"
)

type PIDStat struct {
	PID      int
	Command  string
	UTime    uint64
	STime    uint64
	RSSPages uint64
}

func (s PIDStat) Ticks() uint64 { return s.UTime + s.STime }

// ProcessSample carries cumulative CPU time in nanoseconds so every host
// (Linux ticks, macOS mach time, Windows 100ns units) converts once.
type ProcessSample struct {
	PID      int
	User     string
	Command  string
	CPUNs    uint64
	RSSBytes uint64
}

type ProcessRow struct {
	PID        int
	User       string
	CPUPercent float64
	MemPercent float64
	Command    string
}

func ParsePIDStat(text string) (PIDStat, error) {
	text = strings.TrimSpace(text)
	open := strings.IndexByte(text, '(')
	close := strings.LastIndexByte(text, ')')
	if open <= 0 || close < open {
		return PIDStat{}, errors.New("bad stat")
	}
	pid, err := strconv.Atoi(strings.TrimSpace(text[:open]))
	if err != nil {
		return PIDStat{}, err
	}
	rest := strings.Fields(text[close+1:])
	if len(rest) < 22 {
		return PIDStat{}, errors.New("short stat")
	}
	utime, err1 := strconv.ParseUint(rest[11], 10, 64)
	stime, err2 := strconv.ParseUint(rest[12], 10, 64)
	rss, err3 := strconv.ParseUint(rest[21], 10, 64)
	if err1 != nil || err2 != nil || err3 != nil {
		return PIDStat{}, errors.New("bad stat counters")
	}
	return PIDStat{
		PID:      pid,
		Command:  text[open+1 : close],
		UTime:    utime,
		STime:    stime,
		RSSPages: rss,
	}, nil
}

func ParseStatusUID(text string) (int, error) {
	for _, line := range strings.Split(text, "\n") {
		if !strings.HasPrefix(line, "Uid:") {
			continue
		}
		fields := strings.Fields(line)
		if len(fields) < 2 {
			return 0, errors.New("bad uid")
		}
		return strconv.Atoi(fields[1])
	}
	return 0, errors.New("uid missing")
}

// ProcessCPUPercent converts a CPU-time delta in nanoseconds into a
// percentage of one core. prev == nil means the pid was first seen (no rate
// yet). A decrease is a reset and uses curr as the delta. Multi-threaded
// tasks may exceed 100.
func ProcessCPUPercent(prev *uint64, currNs uint64, elapsedSec float64) float64 {
	if prev == nil || elapsedSec <= 0 {
		return 0
	}
	return float64(deltaCounter(*prev, currNs)) / 1e9 / elapsedSec * 100
}

func MemPercent(rssBytes, totalBytes uint64) float64 {
	if totalBytes == 0 {
		return 0
	}
	return float64(rssBytes) / float64(totalBytes) * 100
}

// RankProcesses returns the top limit tasks by CPU and the next CPU-time
// baseline for every pid in samples (not only the ones emitted).
func RankProcesses(samples []ProcessSample, prev map[int]uint64, elapsedSec float64, memTotalBytes uint64, limit int) ([]ProcessRow, map[int]uint64) {
	next := make(map[int]uint64, len(samples))
	rows := make([]ProcessRow, 0, len(samples))
	for _, s := range samples {
		next[s.PID] = s.CPUNs
		var prevTicks *uint64
		if prev != nil {
			if v, ok := prev[s.PID]; ok {
				held := v
				prevTicks = &held
			}
		}
		cmd := s.Command
		if cmd == "" {
			cmd = "?"
		}
		rows = append(rows, ProcessRow{
			PID:        s.PID,
			User:       s.User,
			CPUPercent: ProcessCPUPercent(prevTicks, s.CPUNs, elapsedSec),
			MemPercent: MemPercent(s.RSSBytes, memTotalBytes),
			Command:    cmd,
		})
	}
	sort.Slice(rows, func(i, j int) bool {
		if rows[i].CPUPercent == rows[j].CPUPercent {
			return rows[i].PID < rows[j].PID
		}
		return rows[i].CPUPercent > rows[j].CPUPercent
	})
	if limit >= 0 && len(rows) > limit {
		rows = rows[:limit]
	}
	return rows, next
}
