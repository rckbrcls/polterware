// Package fault is the domain error shape mapped to Connect codes by the core.
package fault

import "errors"

const (
	CodeNotFound     = "not_found"
	CodeConflict     = "conflict"
	CodeInvalid      = "invalid"
	CodeCycle        = "cycle"
	CodePrecondition = "precondition"
	CodeExhausted    = "exhausted"
	CodeUnavailable  = "unavailable"
	CodeExists       = "already_exists"
)

// Violation is one INVALID_ARGUMENT field error.
type Violation struct {
	Field  string
	Reason string
}

// Error is a domain failure. Current is the stored entity on a rev conflict.
type Error struct {
	Code       string
	Message    string
	Violations []Violation
	Entity     string
	EntityID   string
	Rev        int64
	Current    any
}

func (e *Error) Error() string {
	if e == nil {
		return ""
	}
	if e.Message != "" {
		return e.Message
	}
	return e.Code
}

// IsCode reports whether err is a *Error with the given code.
func IsCode(err error, code string) bool {
	var target *Error
	if !errors.As(err, &target) {
		return false
	}
	return target.Code == code
}

func NotFound(entity, id string) *Error {
	return &Error{Code: CodeNotFound, Entity: entity, EntityID: id, Message: entity + " not found"}
}

func Conflict(entity, id string, rev int64, current any) *Error {
	return &Error{
		Code:     CodeConflict,
		Entity:   entity,
		EntityID: id,
		Rev:      rev,
		Current:  current,
		Message:  entity + " rev conflict",
	}
}

func Invalid(violations ...Violation) *Error {
	return &Error{Code: CodeInvalid, Violations: violations, Message: "invalid argument"}
}

func Precondition(reason, entity, id string) *Error {
	return &Error{Code: CodePrecondition, Message: reason, Entity: entity, EntityID: id}
}

func Exists(entity, id string) *Error {
	return &Error{Code: CodeExists, Entity: entity, EntityID: id, Message: entity + " already exists"}
}

func Exhausted(message string) *Error {
	return &Error{Code: CodeExhausted, Message: message}
}

func Unavailable(message string) *Error {
	return &Error{Code: CodeUnavailable, Message: message}
}
