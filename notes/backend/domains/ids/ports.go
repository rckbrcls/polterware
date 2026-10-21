// Package ids generates ULID strings.
package ids

// Generator returns 26-character Crockford base32 ULIDs.
type Generator interface {
	New() string
}
