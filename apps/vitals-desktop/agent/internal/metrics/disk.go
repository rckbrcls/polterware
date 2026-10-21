package metrics

import "strings"

// Diskstats sector size. The kernel's /proc/diskstats "sector" is always 512
// bytes, independent of the device logical block size.
const SectorSize = 512

type DiskSample struct {
	Device       string
	ReadSectors  uint64
	WriteSectors uint64
	IOTimeMs     uint64
}

type DiskRate struct {
	Device           string
	ReadBytesPerSec  float64
	WriteBytesPerSec float64
	UtilPercent      float64
}

func ParseDiskstats(text string) []DiskSample {
	var out []DiskSample
	for _, line := range strings.Split(text, "\n") {
		f := strings.Fields(line)
		// major minor name + at least the io-time field (index 12).
		if len(f) < 13 {
			continue
		}
		out = append(out, DiskSample{
			Device:       f[2],
			ReadSectors:  parseU64(f[5]),
			WriteSectors: parseU64(f[9]),
			IOTimeMs:     parseU64(f[12]),
		})
	}
	return out
}

// SkipDiskName rejects ramdisks and loop/floppy devices that show up in diskstats.
func SkipDiskName(name string) bool {
	return name == "" ||
		strings.HasPrefix(name, "loop") ||
		strings.HasPrefix(name, "ram") ||
		strings.HasPrefix(name, "fd")
}

// LooksLikeWholeDisk is the name heuristic used when /sys/block is unavailable.
// Partitions (sda1, nvme0n1p1, mmcblk0p1) are excluded so rates are not doubled.
func LooksLikeWholeDisk(name string) bool {
	if SkipDiskName(name) {
		return false
	}
	if strings.HasPrefix(name, "nvme") {
		return !strings.Contains(name, "p")
	}
	if strings.HasPrefix(name, "mmcblk") {
		rest := strings.TrimPrefix(name, "mmcblk")
		return !strings.Contains(rest, "p")
	}
	last := name[len(name)-1]
	return last < '0' || last > '9'
}

func FilterDisks(samples []DiskSample, whole func(name string) bool) []DiskSample {
	out := make([]DiskSample, 0, len(samples))
	for _, s := range samples {
		if whole(s.Device) {
			out = append(out, s)
		}
	}
	return out
}

func DiskRates(prev, curr []DiskSample, elapsedSec float64) []DiskRate {
	prevBy := make(map[string]DiskSample, len(prev))
	for _, s := range prev {
		prevBy[s.Device] = s
	}
	out := make([]DiskRate, 0, len(curr))
	for _, s := range curr {
		rate := DiskRate{Device: s.Device}
		if p, ok := prevBy[s.Device]; ok && elapsedSec > 0 {
			readBytes := deltaCounter(p.ReadSectors, s.ReadSectors) * SectorSize
			writeBytes := deltaCounter(p.WriteSectors, s.WriteSectors) * SectorSize
			rate.ReadBytesPerSec = float64(readBytes) / elapsedSec
			rate.WriteBytesPerSec = float64(writeBytes) / elapsedSec
			ioMs := deltaCounter(p.IOTimeMs, s.IOTimeMs)
			util := float64(ioMs) / (elapsedSec * 1000) * 100
			if util > 100 {
				util = 100
			}
			rate.UtilPercent = util
		}
		out = append(out, rate)
	}
	return out
}

type Mount struct {
	Device     string
	MountPoint string
	FSType     string
}

var pseudoFS = map[string]struct{}{
	"autofs": {}, "binfmt_misc": {}, "bpf": {}, "cgroup": {}, "cgroup2": {},
	"configfs": {}, "cpuset": {}, "debugfs": {}, "devpts": {}, "devtmpfs": {},
	"efivarfs": {}, "fusectl": {}, "hugetlbfs": {}, "mqueue": {}, "nsfs": {},
	"proc": {}, "pstore": {}, "ramfs": {}, "rootfs": {}, "rpc_pipefs": {},
	"securityfs": {}, "sysfs": {}, "tmpfs": {}, "tracefs": {},
}

func IsPseudoFS(fstype string) bool {
	_, ok := pseudoFS[fstype]
	return ok
}

func ParseMounts(text string) []Mount {
	var out []Mount
	for _, line := range strings.Split(text, "\n") {
		f := strings.Fields(line)
		if len(f) < 3 {
			continue
		}
		fstype := f[2]
		if IsPseudoFS(fstype) {
			continue
		}
		out = append(out, Mount{
			Device:     unescapeMount(f[0]),
			MountPoint: unescapeMount(f[1]),
			FSType:     fstype,
		})
	}
	return out
}

func unescapeMount(s string) string {
	if !strings.Contains(s, `\`) {
		return s
	}
	var b strings.Builder
	b.Grow(len(s))
	for i := 0; i < len(s); i++ {
		if s[i] == '\\' && i+3 < len(s) && isOctal(s[i+1]) && isOctal(s[i+2]) && isOctal(s[i+3]) {
			v := (s[i+1]-'0')<<6 | (s[i+2]-'0')<<3 | (s[i+3] - '0')
			b.WriteByte(v)
			i += 3
			continue
		}
		b.WriteByte(s[i])
	}
	return b.String()
}

func isOctal(c byte) bool { return c >= '0' && c <= '7' }

type DiskUsage struct {
	SizeKb     uint64
	UsedKb     uint64
	AvailKb    uint64
	UsePercent float64
}

// Usage converts statfs block counts. used is (blocks - bfree), matching df.
func Usage(blocks, bfree, bavail, bsize uint64) DiskUsage {
	if bsize == 0 {
		return DiskUsage{}
	}
	var usedBlocks uint64
	if blocks > bfree {
		usedBlocks = blocks - bfree
	}
	var pct float64
	if blocks > 0 {
		pct = float64(usedBlocks) / float64(blocks) * 100
	}
	return DiskUsage{
		SizeKb:     blocks * bsize / 1024,
		UsedKb:     usedBlocks * bsize / 1024,
		AvailKb:    bavail * bsize / 1024,
		UsePercent: pct,
	}
}
