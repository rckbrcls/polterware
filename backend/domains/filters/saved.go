// Package filters holds saved filters: named filter combinations per project
// and surface (page). They are UI preferences, not audited project changes.
package filters

import (
	"encoding/json"
	"errors"
	"strings"
	"time"
	"unicode/utf8"
)

const (
	// MaxNameLen is the longest saved filter name, counted in runes.
	MaxNameLen = 80
	// MaxSurfaceLen is the longest surface key, counted in runes.
	MaxSurfaceLen = 64
)

var (
	ErrSurfaceRequired = errors.New("saved filter surface is required")
	ErrSurfaceLength   = errors.New("saved filter surface is too long")
	ErrNameRequired    = errors.New("saved filter name is required")
	ErrNameLength      = errors.New("saved filter name is too long")
	ErrPayload         = errors.New("saved filter payload must be a JSON object with an integer version")
	ErrNotFound        = errors.New("saved filter not found")
	ErrProjectNotFound = errors.New("saved filter project not found")
)

// SavedFilter is one named filter combination for a surface. An empty
// ProjectID is an app-level surface such as "projects". PayloadJSON is opaque
// JSON the UI owns and must contain an integer version.
type SavedFilter struct {
	ID          string
	ProjectID   string
	Surface     string
	Name        string
	PayloadJSON string
	Position    int
	CreatedAt   time.Time
	UpdatedAt   time.Time
}

// PrepareSave trims the filter's keys and payload and validates them.
func PrepareSave(filter SavedFilter) (SavedFilter, error) {
	filter.ProjectID = strings.TrimSpace(filter.ProjectID)
	filter.Surface = strings.TrimSpace(filter.Surface)
	filter.Name = strings.TrimSpace(filter.Name)
	filter.PayloadJSON = strings.TrimSpace(filter.PayloadJSON)
	if err := ValidateSurface(filter.Surface); err != nil {
		return SavedFilter{}, err
	}
	if filter.Name == "" {
		return SavedFilter{}, ErrNameRequired
	}
	if utf8.RuneCountInString(filter.Name) > MaxNameLen {
		return SavedFilter{}, ErrNameLength
	}
	if err := ValidatePayload(filter.PayloadJSON); err != nil {
		return SavedFilter{}, err
	}
	return filter, nil
}

// ValidateSurface reports whether a trimmed surface is non-empty and within
// MaxSurfaceLen.
func ValidateSurface(surface string) error {
	if surface == "" {
		return ErrSurfaceRequired
	}
	if utf8.RuneCountInString(surface) > MaxSurfaceLen {
		return ErrSurfaceLength
	}
	return nil
}

// ValidatePayload reports whether payload is a JSON object with an integer
// version of at least 1. Every other field stays opaque.
func ValidatePayload(payload string) error {
	dec := json.NewDecoder(strings.NewReader(payload))
	dec.UseNumber()
	var obj map[string]any
	if err := dec.Decode(&obj); err != nil || obj == nil {
		return ErrPayload
	}
	if dec.More() {
		return ErrPayload
	}
	number, ok := obj["version"].(json.Number)
	if !ok {
		return ErrPayload
	}
	version, err := number.Int64()
	if err != nil || version < 1 {
		return ErrPayload
	}
	return nil
}

// NextPosition is one past the highest position, or 0 when there are none.
func NextPosition(existing []SavedFilter) int {
	next := 0
	for _, filter := range existing {
		if filter.Position >= next {
			next = filter.Position + 1
		}
	}
	return next
}
