package metrics

import "strings"

type Pressure struct {
	CPU    float64
	Memory float64
	IO     float64
}

// ParsePSIAvg10 reads the "some" avg10 value from a /proc/pressure/* file.
func ParsePSIAvg10(text string) (float64, bool) {
	for _, line := range strings.Split(text, "\n") {
		line = strings.TrimSpace(line)
		if !strings.HasPrefix(line, "some") {
			continue
		}
		for _, f := range strings.Fields(line) {
			v, ok := strings.CutPrefix(f, "avg10=")
			if !ok {
				continue
			}
			n, err := parseFloat(v)
			if err != nil {
				return 0, false
			}
			return n, true
		}
	}
	return 0, false
}
