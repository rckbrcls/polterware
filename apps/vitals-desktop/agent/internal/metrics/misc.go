package metrics

import (
	"strconv"
	"strings"
)

func ParseLoadavg(text string) (load [3]float64, ok bool) {
	fields := strings.Fields(text)
	if len(fields) < 3 {
		return load, false
	}
	for i := 0; i < 3; i++ {
		n, err := parseFloat(fields[i])
		if err != nil {
			return [3]float64{}, false
		}
		load[i] = n
	}
	return load, true
}

func ParseUptime(text string) (float64, bool) {
	fields := strings.Fields(text)
	if len(fields) == 0 {
		return 0, false
	}
	n, err := parseFloat(fields[0])
	if err != nil {
		return 0, false
	}
	return n, true
}

func MilliCelsius(raw string) (float64, error) {
	n, err := parseFloat(strings.TrimSpace(raw))
	if err != nil {
		return 0, err
	}
	return n / 1000, nil
}

type GPU struct {
	Index              int
	Name               string
	TemperatureC       float64
	UtilizationPercent float64
	MemoryUsedMb       float64
	MemoryTotalMb      float64
}

func ParseNvidiaSMI(text string) []GPU {
	var out []GPU
	for _, line := range strings.Split(text, "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		parts := strings.Split(line, ",")
		if len(parts) < 6 {
			continue
		}
		for i := range parts {
			parts[i] = strings.TrimSpace(parts[i])
		}
		out = append(out, GPU{
			Index:              int(parseU64(parts[0])),
			Name:               parts[1],
			TemperatureC:       parseFloatOr0(parts[2]),
			UtilizationPercent: parseFloatOr0(parts[3]),
			MemoryUsedMb:       parseFloatOr0(parts[4]),
			MemoryTotalMb:      parseFloatOr0(parts[5]),
		})
	}
	return out
}

func parseU64(s string) uint64 {
	n, err := strconv.ParseUint(s, 10, 64)
	if err != nil {
		return 0
	}
	return n
}

func parseFloat(s string) (float64, error) {
	return strconv.ParseFloat(s, 64)
}

func parseFloatOr0(s string) float64 {
	n, err := parseFloat(s)
	if err != nil {
		return 0
	}
	return n
}
