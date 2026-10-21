package core

import (
	"context"
	"encoding/json"
	"errors"

	"connectrpc.com/connect"
	"github.com/polterware/polterware/notes/backend/domains/fault"
	"github.com/polterware/polterware/notes/backend/domains/note"
	"github.com/polterware/polterware/notes/backend/domains/space"
	"github.com/polterware/polterware/notes/backend/domains/tag"
	v1 "github.com/polterware/polterware/notes/backend/platform/gen/notes/v1"
	"google.golang.org/protobuf/encoding/protojson"
	"google.golang.org/protobuf/proto"
)

func mapError(err error) error {
	if err == nil {
		return nil
	}
	var existing *connect.Error
	if errors.As(err, &existing) {
		return err
	}
	if errors.Is(err, context.Canceled) {
		return connect.NewError(connect.CodeCanceled, context.Canceled)
	}
	if errors.Is(err, context.DeadlineExceeded) {
		return connect.NewError(connect.CodeDeadlineExceeded, context.DeadlineExceeded)
	}
	var domain *fault.Error
	if !errors.As(err, &domain) {
		return connect.NewError(connect.CodeInternal, errors.New("internal core error"))
	}
	code := connect.CodeInternal
	switch domain.Code {
	case fault.CodeNotFound:
		code = connect.CodeNotFound
	case fault.CodeInvalid:
		code = connect.CodeInvalidArgument
	case fault.CodeExists:
		code = connect.CodeAlreadyExists
	case fault.CodeConflict, fault.CodeCycle, fault.CodePrecondition:
		code = connect.CodeFailedPrecondition
	case fault.CodeExhausted:
		code = connect.CodeResourceExhausted
	case fault.CodeUnavailable:
		code = connect.CodeUnavailable
	}
	result := connect.NewError(code, domain)
	if code == connect.CodeInvalidArgument {
		bad := &v1.BadRequest{}
		for _, v := range domain.Violations {
			bad.Violations = append(bad.Violations, &v1.FieldViolation{Field: v.Field, Reason: v.Reason})
		}
		if detail, err := connect.NewErrorDetail(bad); err == nil {
			result.AddDetail(detail)
		}
	}
	if code == connect.CodeFailedPrecondition {
		reason := domain.Message
		if domain.Code == fault.CodeConflict {
			reason = "rev_conflict"
		}
		if domain.Code == fault.CodeCycle {
			reason = "space_cycle"
		}
		current, err := currentJSON(domain.Current)
		if err != nil {
			return connect.NewError(connect.CodeInternal, errors.New("encode conflict entity"))
		}
		value := &v1.PreconditionDetail{Reason: reason, Entity: domain.Entity, EntityId: domain.EntityID, CurrentRev: domain.Rev, CurrentJson: current}
		if detail, err := connect.NewErrorDetail(value); err == nil {
			result.AddDetail(detail)
		}
	}
	return result
}
func currentJSON(value any) (string, error) {
	if value == nil {
		return "", nil
	}
	// Use wire names for common domain conflict entities.
	switch v := value.(type) {
	case note.Note:
		value = noteProto(v)
	case *note.Note:
		if v != nil {
			value = noteProto(*v)
		}
	case space.Space:
		value = spaceProto(v)
	case *space.Space:
		if v != nil {
			value = spaceProto(*v)
		}
	case tag.Tag:
		value = tagProto(v)
	case *tag.Tag:
		if v != nil {
			value = tagProto(*v)
		}
	}
	if msg, ok := value.(proto.Message); ok {
		raw, err := protojson.Marshal(msg)
		return string(raw), err
	}
	raw, err := json.Marshal(value)
	return string(raw), err
}
func unavailable(name string) error { return fault.Unavailable(name + " backend is not wired") }
func invalid(field, reason string) error {
	return fault.Invalid(fault.Violation{Field: field, Reason: reason})
}
func response[T any](msg *T, err error) (*connect.Response[T], error) {
	if err != nil {
		return nil, err
	}
	return connect.NewResponse(msg), nil
}
