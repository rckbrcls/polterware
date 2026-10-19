package metrics

import "strings"

type Memory struct {
	TotalKb     uint64
	AvailableKb uint64
	UsedKb      uint64
	SwapTotalKb uint64
	SwapFreeKb  uint64
	SwapUsedKb  uint64
}

func ParseMeminfo(text string) Memory {
	vals := map[string]uint64{}
	for _, line := range strings.Split(text, "\n") {
		name, rest, ok := strings.Cut(line, ":")
		if !ok {
			continue
		}
		fields := strings.Fields(rest)
		if len(fields) == 0 {
			continue
		}
		vals[name] = parseU64(fields[0])
	}
	total := vals["MemTotal"]
	avail := vals["MemAvailable"]
	if avail == 0 {
		avail = vals["MemFree"]
	}
	var used uint64
	if total > avail {
		used = total - avail
	}
	swapTotal := vals["SwapTotal"]
	swapFree := vals["SwapFree"]
	var swapUsed uint64
	if swapTotal > swapFree {
		swapUsed = swapTotal - swapFree
	}
	return Memory{
		TotalKb:     total,
		AvailableKb: avail,
		UsedKb:      used,
		SwapTotalKb: swapTotal,
		SwapFreeKb:  swapFree,
		SwapUsedKb:  swapUsed,
	}
}
