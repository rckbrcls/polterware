package localcore

import (
	"context"

	"connectrpc.com/connect"

	"github.com/polterware/polterware/backend/compositions/wedge"
	localv1 "github.com/polterware/polterware/backend/platform/gen/polterware/local/v1"
	"github.com/polterware/polterware/backend/providers/agentsetup"
)

func (core *Core) hookSwitches() ([]*localv1.HookSwitch, error) {
	stored, err := core.Store.HookSwitches()
	if err != nil {
		return nil, err
	}
	out := make([]*localv1.HookSwitch, 0, len(agentsetup.Hooks))
	for _, hook := range agentsetup.Hooks {
		enabled, ok := stored[hook.Name]
		out = append(out, &localv1.HookSwitch{Name: hook.Name, Label: hook.Label, Note: hook.Note, Enabled: !ok || enabled})
	}
	return out, nil
}

// GetAgentSetup reports the hook switches and the setup doctor. Installing is
// done by `polterware setup`; the core only reads.
func (core *Core) GetAgentSetup(_ context.Context, request *connect.Request[localv1.GetAgentSetupRequest]) (*connect.Response[localv1.GetAgentSetupResponse], error) {
	hooks, err := core.hookSwitches()
	if err != nil {
		return nil, internal(err)
	}
	report := agentsetup.Doctor(core.DBDir)
	root := ""
	if id := request.Msg.ProjectId; id != "" {
		root = wedge.FirstCheckout(core.Store, id)
	}
	agents := agentsetup.InspectAgents(root)
	return connect.NewResponse(&localv1.GetAgentSetupResponse{Setup: &localv1.AgentSetup{
		Hooks:           hooks,
		PolterwarePath:  report.PolterwarePath,
		ClaudePath:      report.ClaudePath,
		PluginInstalled: report.Plugin.Installed,
		PluginEnabled:   report.Plugin.Enabled,
		PluginVersion:   report.Plugin.Version,
		EmbeddedVersion: report.EmbeddedVer,
		MarketplaceDir:  report.Marketplace,
		Problem:         report.Problem,
		SkillPath:       agents.SkillPath,
		SkillReady:      agents.SkillReady,
		AgentsLineReady: agents.LineReady,
	}}), nil
}

func (core *Core) SetHookSwitch(_ context.Context, request *connect.Request[localv1.SetHookSwitchRequest]) (*connect.Response[localv1.SetHookSwitchResponse], error) {
	if !agentsetup.ValidHook(request.Msg.Name) {
		return nil, invalid("unknown hook " + request.Msg.Name)
	}
	if err := core.Store.SetHookSwitch(request.Msg.Name, request.Msg.Enabled); err != nil {
		return nil, internal(err)
	}
	hooks, err := core.hookSwitches()
	if err != nil {
		return nil, internal(err)
	}
	return connect.NewResponse(&localv1.SetHookSwitchResponse{Hooks: hooks}), nil
}

func (core *Core) ListHookSwitches(_ context.Context, _ *connect.Request[localv1.ListHookSwitchesRequest]) (*connect.Response[localv1.ListHookSwitchesResponse], error) {
	hooks, err := core.hookSwitches()
	if err != nil {
		return nil, internal(err)
	}
	return connect.NewResponse(&localv1.ListHookSwitchesResponse{Hooks: hooks}), nil
}
