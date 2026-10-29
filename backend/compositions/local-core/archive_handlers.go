package localcore

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"connectrpc.com/connect"

	"github.com/polterware/polterware/backend/compositions/wedge"
	"github.com/polterware/polterware/backend/domains/agentrun"
	"github.com/polterware/polterware/backend/domains/canvas"
	"github.com/polterware/polterware/backend/domains/knowledge"
	localv1 "github.com/polterware/polterware/backend/platform/gen/polterware/local/v1"
	"github.com/polterware/polterware/backend/platform/ids"
)

// SetKnowledgeArchived archives or restores one knowledge item. Decisions are
// refused: they move through their lifecycle instead.
func (core *Core) SetKnowledgeArchived(_ context.Context, request *connect.Request[localv1.SetKnowledgeArchivedRequest]) (*connect.Response[localv1.SetKnowledgeArchivedResponse], error) {
	msg := request.Msg
	if msg.GetId() == "" {
		return nil, invalid("knowledge id is required")
	}
	env, err := changeEnvelopeFromProto(msg.GetChange())
	if err != nil {
		return nil, mapAuditedErr(err)
	}
	existing, err := core.Store.GetKnowledge(msg.GetId())
	if errors.Is(err, sql.ErrNoRows) {
		return nil, connect.NewError(connect.CodeNotFound, fmt.Errorf("unknown knowledge item"))
	}
	if err != nil {
		return nil, internal(err)
	}
	if existing.Kind == knowledge.KindVerdict {
		return nil, mapArchiveErr(knowledge.ErrDecisionArchive)
	}
	env.ProjectID = existing.ProjectID
	tool := "desktop.knowledge.restore"
	if msg.GetArchived() {
		tool = "desktop.knowledge.archive"
	}
	written, err := wedge.ExecuteAuditedWrite(core.Store, env, agentrun.ActorKindHuman, tool, func(run agentrun.Run) ([]string, any, error) {
		_ = run
		saved, saveErr := core.Store.SetKnowledgeArchived(existing.ID, msg.GetArchived(), time.Now())
		if saveErr != nil {
			return nil, nil, saveErr
		}
		return []string{saved.ID}, saved, nil
	})
	if err != nil {
		return nil, mapArchiveErr(err)
	}
	saved, _ := written.Result.(knowledge.Item)
	return connect.NewResponse(&localv1.SetKnowledgeArchivedResponse{Item: knowledgeProto(saved)}), nil
}

// SetCanvasArchived archives or restores one canvas.
func (core *Core) SetCanvasArchived(_ context.Context, request *connect.Request[localv1.SetCanvasArchivedRequest]) (*connect.Response[localv1.SetCanvasArchivedResponse], error) {
	msg := request.Msg
	if msg.GetProjectId() == "" || msg.GetId() == "" {
		return nil, invalid("project id and canvas id are required")
	}
	env, err := changeEnvelopeFromProto(msg.GetChange())
	if err != nil {
		return nil, mapAuditedErr(err)
	}
	existing, err := core.Store.GetCanvas(msg.GetProjectId(), msg.GetId())
	if errors.Is(err, sql.ErrNoRows) {
		return nil, connect.NewError(connect.CodeNotFound, errors.New("canvas not found"))
	}
	if err != nil {
		return nil, internal(err)
	}
	env.ProjectID = existing.ProjectID
	env.BatchID = ids.NewULID()
	tool := "desktop.canvas.restore"
	if msg.GetArchived() {
		tool = "desktop.canvas.archive"
	}
	written, err := wedge.ExecuteAuditedWrite(core.Store, env, agentrun.ActorKindHuman, tool, func(run agentrun.Run) ([]string, any, error) {
		saved, saveErr := core.Store.SetCanvasArchived(existing.ProjectID, existing.ID, msg.GetArchived(), time.Now(), run.ID, env.BatchID)
		if saveErr != nil {
			return nil, nil, saveErr
		}
		return []string{saved.ID}, saved, nil
	})
	if err != nil {
		return nil, mapCanvasWriteErr(err)
	}
	saved, _ := written.Result.(canvas.Canvas)
	return connect.NewResponse(&localv1.SetCanvasArchivedResponse{Canvas: canvasProto(saved)}), nil
}

// mapArchiveErr reports an archive rule as FAILED_PRECONDITION and anything
// else as an audited-write error.
func mapArchiveErr(err error) error {
	switch {
	case errors.Is(err, knowledge.ErrDecisionArchive),
		errors.Is(err, knowledge.ErrNotArchived),
		errors.Is(err, knowledge.ErrArchived),
		errors.Is(err, canvas.ErrNotArchived),
		errors.Is(err, canvas.ErrArchived):
		return connect.NewError(connect.CodeFailedPrecondition, err)
	default:
		return mapAuditedErr(err)
	}
}

// archivedStamp formats an archive time; the zero time is an empty string.
func archivedStamp(at time.Time) string {
	if at.IsZero() {
		return ""
	}
	return at.UTC().Format(time.RFC3339)
}
