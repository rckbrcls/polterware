// Package clock is the time source domain code depends on.
package clock

import "time"

// Clock returns the current instant. Callers treat the result as UTC.
type Clock interface {
	Now() time.Time
}
