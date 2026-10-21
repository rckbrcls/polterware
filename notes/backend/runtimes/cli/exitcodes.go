package main

import (
	"errors"
	"flag"
	"fmt"

	"connectrpc.com/connect"
	v1 "github.com/polterware/polterware/notes/backend/platform/gen/notes/v1"
	"github.com/polterware/polterware/notes/backend/platform/runstate"
)

// Documented pwnotes CLI exit codes (stable for scripts).
const (
	ExitOK       = 0 // success
	ExitError    = 1 // runtime or RPC failure
	ExitUsage    = 2 // flags, unknown command, missing arguments
	ExitLocked   = 3 // core already running (serve)
	ExitNotFound = 4 // entity not found
	ExitConflict = 5 // expected_rev mismatch
	ExitRefused  = 6 // destructive command without --yes
)

type cliError struct {
	code int
	err  error
}

func (e cliError) Error() string {
	if e.err == nil {
		return ""
	}
	return e.err.Error()
}

func (e cliError) Unwrap() error { return e.err }

func exitf(code int, format string, args ...any) error {
	return cliError{code: code, err: fmt.Errorf(format, args...)}
}

func refuseYes(action string) error {
	return exitf(ExitRefused, "refusing to %s without --yes", action)
}

func usagef(format string, args ...any) error {
	return exitf(ExitUsage, format, args...)
}

func mapRPC(err error) error {
	if err == nil {
		return nil
	}
	if errors.Is(err, flag.ErrHelp) {
		return cliError{code: ExitOK}
	}
	var ce cliError
	if errors.As(err, &ce) {
		return err
	}
	var locked runstate.LockedError
	if errors.As(err, &locked) {
		return cliError{code: ExitLocked, err: err}
	}
	code := connect.CodeOf(err)
	switch code {
	case connect.CodeNotFound:
		return cliError{code: ExitNotFound, err: err}
	case connect.CodeInvalidArgument:
		return cliError{code: ExitError, err: err}
	case connect.CodeFailedPrecondition, connect.CodeAborted:
		if reason, entity, id, rev, ok := conflictDetail(err); ok && reason == "rev_conflict" {
			return cliError{code: ExitConflict, err: fmt.Errorf("revision conflict for %s %s (current rev %d)", entity, id, rev)}
		}
		return cliError{code: ExitConflict, err: err}
	case connect.CodeUnknown:
		return cliError{code: ExitError, err: err}
	default:
		return cliError{code: ExitError, err: err}
	}
}

func conflictDetail(err error) (reason, entity, id string, rev int64, ok bool) {
	var ce *connect.Error
	if !errors.As(err, &ce) {
		return "", "", "", 0, false
	}
	for _, d := range ce.Details() {
		value, err := d.Value()
		if err != nil {
			continue
		}
		detail, ok := value.(*v1.PreconditionDetail)
		if !ok {
			continue
		}
		return detail.Reason, detail.Entity, detail.EntityId, detail.CurrentRev, true
	}
	return "", "", "", 0, false
}

func exitCodeOf(err error) int {
	if err == nil {
		return ExitOK
	}
	if errors.Is(err, flag.ErrHelp) {
		return ExitOK
	}
	var ce cliError
	if errors.As(err, &ce) {
		return ce.code
	}
	var locked runstate.LockedError
	if errors.As(err, &locked) {
		return ExitLocked
	}
	return ExitError
}
