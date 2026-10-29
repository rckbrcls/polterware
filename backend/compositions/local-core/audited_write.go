package localcore

import (
	"errors"

	"connectrpc.com/connect"

	"github.com/polterware/polterware/backend/compositions/wedge"
	"github.com/polterware/polterware/backend/domains/agentrun"
	localv1 "github.com/polterware/polterware/backend/platform/gen/polterware/local/v1"
)

func changeEnvelopeFromProto(msg *localv1.ChangeEnvelope) (wedge.ChangeEnvelope, error) {
	if msg == nil {
		return wedge.ChangeEnvelope{}, agentrun.ErrChangeIncomplete
	}
	env := wedge.ChangeEnvelope{
		Summary:    msg.GetSummary(),
		Rationale:  msg.GetRationale(),
		AgentRunID: msg.GetAgentRunId(),
	}
	// Only the summary is checked here: the audited write checks the rationale
	// for its actor, since a person may leave the reason out.
	if err := agentrun.ValidateChangeAs(agentrun.ActorKindHuman, env.Summary, env.Rationale); err != nil {
		return wedge.ChangeEnvelope{}, err
	}
	return env, nil
}

func mapAuditedErr(err error) error {
	if err == nil {
		return nil
	}
	switch {
	case errors.Is(err, agentrun.ErrChangeIncomplete),
		errors.Is(err, agentrun.ErrMissingAgentRunID),
		errors.Is(err, agentrun.ErrEmptyProject),
		errors.Is(err, agentrun.ErrInvalidActorKind),
		errors.Is(err, agentrun.ErrProjectMismatch),
		errors.Is(err, agentrun.ErrRunNotOpen),
		errors.Is(err, agentrun.ErrInvalidKind):
		return invalid(err.Error())
	case errors.Is(err, agentrun.ErrUnknownRun):
		return connect.NewError(connect.CodeNotFound, err)
	default:
		return internal(err)
	}
}
