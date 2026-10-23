// Package maintenance is the backup seam. Export and Doctor are composed by the core.
package maintenance

// Check is one doctor finding.
type Check struct {
	Name   string
	OK     bool
	Detail string
}

// Report is MaintenanceService.Doctor.
type Report struct {
	OK     bool
	Checks []Check
}
