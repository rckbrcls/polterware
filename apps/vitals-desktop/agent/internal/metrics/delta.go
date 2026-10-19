package metrics

// deltaCounter is the increment of a monotonic kernel counter.
// When curr < prev the counter was reset (driver reload, reboot of a
// namespace, pid reuse). The increment is then curr itself, which is the
// amount counted since the reset to zero.
func deltaCounter(prev, curr uint64) uint64 {
	if curr >= prev {
		return curr - prev
	}
	return curr
}
