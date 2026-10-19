// Package place stores map locations. v1 does not arm geofences.
package place

import "time"

const (
	EventEnter = "enter"
	EventExit  = "exit"

	DefaultRadiusM = 200
	MinRadiusM     = 25
	MaxRadiusM     = 5000
)

// Place is the places row. RadiusM defaults to 200. Event defaults to enter.
type Place struct {
	NoteID    string
	Name      *string
	Lat       float64
	Lng       float64
	RadiusM   float64
	Event     string
	Active    bool
	UpdatedAt time.Time
}

// Bounds is a map viewport. South < North. West/East may cross the antimeridian.
type Bounds struct {
	South float64
	West  float64
	North float64
	East  float64
}
