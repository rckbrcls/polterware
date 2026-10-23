// Package ids creates ULIDs with cryptographic entropy and millisecond timestamps.
package ids

import (
	"crypto/rand"
	"time"
)

const crockford = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"

type Generator struct{}

func (Generator) New() string { return New() }
func New() string {
	var raw [16]byte
	ms := uint64(time.Now().UnixMilli())
	for i := 5; i >= 0; i-- {
		raw[i] = byte(ms)
		ms >>= 8
	}
	// crypto/rand.Read terminates the process if the system entropy source fails.
	_, _ = rand.Read(raw[6:])
	var out [26]byte
	var acc uint64
	bits, pos := 2, 0
	for _, b := range raw {
		acc = acc<<8 | uint64(b)
		bits += 8
		for bits >= 5 {
			bits -= 5
			out[pos] = crockford[(acc>>uint(bits))&31]
			pos++
		}
	}
	return string(out[:])
}
