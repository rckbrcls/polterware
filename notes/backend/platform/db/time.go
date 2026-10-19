package db

import "time"

// RFC3339Milli is UTC timestamps as stored in SQLite and on the wire.
const RFC3339Milli = "2006-01-02T15:04:05.000Z"

func FormatTime(t time.Time) string {
	return t.UTC().Format(RFC3339Milli)
}

func ParseTime(s string) (time.Time, error) {
	if s == "" {
		return time.Time{}, nil
	}
	if t, err := time.Parse(RFC3339Milli, s); err == nil {
		return t, nil
	}
	return time.Parse(time.RFC3339, s)
}
