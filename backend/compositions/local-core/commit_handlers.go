package localcore

import (
	"context"
	"errors"
	"time"

	"connectrpc.com/connect"

	"github.com/polterware/polterware/backend/compositions/wedge"
	localv1 "github.com/polterware/polterware/backend/platform/gen/polterware/local/v1"
)

// ListCardCommits lists a card's commits: linked ones, then ones cited in a
// checkout's recent subjects.
func (core *Core) ListCardCommits(_ context.Context, request *connect.Request[localv1.ListCardCommitsRequest]) (*connect.Response[localv1.ListCardCommitsResponse], error) {
	if request.Msg.ProjectId == "" || request.Msg.Slug == "" {
		return nil, invalid("project id and slug are required")
	}
	commits, err := wedge.CardCommits(core.Store, request.Msg.ProjectId, request.Msg.Slug)
	if err != nil {
		return nil, commitErr(err)
	}
	out := make([]*localv1.CardCommit, 0, len(commits))
	for _, commit := range commits {
		out = append(out, cardCommitProto(commit))
	}
	return connect.NewResponse(&localv1.ListCardCommitsResponse{Commits: out}), nil
}

// LinkTaskCommit links a commit to a task given as slug#T2.
func (core *Core) LinkTaskCommit(_ context.Context, request *connect.Request[localv1.LinkTaskCommitRequest]) (*connect.Response[localv1.LinkTaskCommitResponse], error) {
	if request.Msg.ProjectId == "" {
		return nil, invalid("project id is required")
	}
	commit, err := wedge.LinkTaskCommit(core.Store, request.Msg.ProjectId, request.Msg.Task, request.Msg.Sha)
	if err != nil {
		return nil, commitErr(err)
	}
	return connect.NewResponse(&localv1.LinkTaskCommitResponse{Commit: cardCommitProto(commit)}), nil
}

// UnlinkTaskCommit removes a stored commit link.
func (core *Core) UnlinkTaskCommit(_ context.Context, request *connect.Request[localv1.UnlinkTaskCommitRequest]) (*connect.Response[localv1.UnlinkTaskCommitResponse], error) {
	if request.Msg.ProjectId == "" {
		return nil, invalid("project id is required")
	}
	if err := wedge.UnlinkTaskCommit(core.Store, request.Msg.ProjectId, request.Msg.Task, request.Msg.Sha); err != nil {
		return nil, commitErr(err)
	}
	return connect.NewResponse(&localv1.UnlinkTaskCommitResponse{}), nil
}

func commitErr(err error) error {
	if errors.Is(err, wedge.ErrCommitInput) || err.Error() == "unknown project" {
		return invalid(err.Error())
	}
	return internal(err)
}

func cardCommitProto(commit wedge.CardCommit) *localv1.CardCommit {
	out := &localv1.CardCommit{
		TaskNumber: int32(commit.TaskNumber), Sha: commit.SHA, ShortSha: commit.ShortSHA(),
		Subject: commit.Subject, Url: commit.URL, Repo: commit.Repo, Cited: commit.Cited,
	}
	if !commit.CommittedAt.IsZero() {
		out.CommittedAt = commit.CommittedAt.UTC().Format(time.RFC3339)
	}
	return out
}
