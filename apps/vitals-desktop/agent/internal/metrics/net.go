package metrics

import "strings"

type NetSample struct {
	Name   string
	RX, TX uint64
}

type NetRate struct {
	Name          string
	RXBytesPerSec float64
	TXBytesPerSec float64
}

func ParseNetDev(text string) []NetSample {
	var out []NetSample
	for _, line := range strings.Split(text, "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "Inter-") || strings.HasPrefix(line, "face") {
			continue
		}
		name, rest, ok := strings.Cut(line, ":")
		if !ok {
			continue
		}
		fields := strings.Fields(rest)
		if len(fields) < 9 {
			continue
		}
		out = append(out, NetSample{
			Name: strings.TrimSpace(name),
			RX:   parseU64(fields[0]),
			TX:   parseU64(fields[8]),
		})
	}
	return out
}

// IsVirtualIfaceName reports names that are never physical NICs.
// tailscale0 and other tun devices are not matched here; the caller drops
// them when /sys/class/net/<if>/device is absent.
func IsVirtualIfaceName(name string) bool {
	switch {
	case name == "lo":
		return true
	case strings.HasPrefix(name, "veth"):
		return true
	case strings.HasPrefix(name, "docker"):
		return true
	case strings.HasPrefix(name, "br-"):
		return true
	case strings.HasPrefix(name, "virbr"):
		return true
	default:
		return false
	}
}

// KeepIface is true for a physical interface: not a known virtual name, and
// the sysfs device link exists.
func KeepIface(name string, hasDevice bool) bool {
	if name == "" || IsVirtualIfaceName(name) {
		return false
	}
	return hasDevice
}

func FilterNet(samples []NetSample, keep func(name string) bool) []NetSample {
	out := make([]NetSample, 0, len(samples))
	for _, s := range samples {
		if keep(s.Name) {
			out = append(out, s)
		}
	}
	return out
}

// NetRates computes per-second byte rates. A counter that moves backwards is
// treated as a reset (delta = curr). Unknown previous names contribute 0.
// elapsedSec <= 0 yields zeros.
func NetRates(prev, curr []NetSample, elapsedSec float64) []NetRate {
	prevBy := make(map[string]NetSample, len(prev))
	for _, s := range prev {
		prevBy[s.Name] = s
	}
	out := make([]NetRate, 0, len(curr))
	for _, s := range curr {
		rate := NetRate{Name: s.Name}
		if p, ok := prevBy[s.Name]; ok && elapsedSec > 0 {
			rate.RXBytesPerSec = float64(deltaCounter(p.RX, s.RX)) / elapsedSec
			rate.TXBytesPerSec = float64(deltaCounter(p.TX, s.TX)) / elapsedSec
		}
		out = append(out, rate)
	}
	return out
}
