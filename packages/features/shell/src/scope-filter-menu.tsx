import { Box, Boxes, Cloud, Layers, type ActiveFilterPill, type FilterPopoverGroup } from "@polterware/frontend-design-system";
import type { ScopeFilterEnvironment, ScopeFilterKey, ScopeFilterNode, ScopeFilterToken } from "./scope-filter";
import { SCOPE_FILTER_MENU_LABELS, scopeFilterMenuSections, toggleScopeFilterMenuToken } from "./scope-filter-menu-state";

function ScopeIcon(props: { kind: ScopeFilterKey }) {
  const Icon = props.kind === "system" ? Boxes : props.kind === "domain" ? Layers : props.kind === "component" ? Box : Cloud;
  return <Icon size={14} aria-hidden />;
}

/** Scope groups fit into each page's existing FilterPopover while the selection remains shell-owned. */
export function scopeFilterMenuGroups(props: {
  tokens: readonly ScopeFilterToken[];
  nodes: readonly ScopeFilterNode[];
  environments: readonly ScopeFilterEnvironment[];
  allowEnv: boolean;
  onTokensChange: (tokens: ScopeFilterToken[]) => void;
}): FilterPopoverGroup[] {
  return scopeFilterMenuSections(props).map((section) => ({
    id: `scope-${section.key}`,
    label: section.label,
    leading: <ScopeIcon kind={section.key} />,
    options: section.options.map((option) => {
        const token: ScopeFilterToken = { key: section.key, value: option.label, id: option.id };
        return {
          id: option.id,
          label: option.label,
          leading: <ScopeIcon kind={section.key} />,
          checked: props.tokens.some((item) => item.key === section.key && item.id === option.id),
          onCheckedChange: (checked: boolean) => props.onTokensChange(toggleScopeFilterMenuToken(props.tokens, token, checked)),
        };
      }),
  }));
}

/** Active scopes render with the same removable-filter treatment as local page filters. */
export function scopeFilterPills(
  tokens: readonly ScopeFilterToken[],
  onTokensChange: (tokens: ScopeFilterToken[]) => void,
): ActiveFilterPill[] {
  return tokens.map((token) => ({
    id: `scope-${token.key}-${token.id}`,
    label: `${SCOPE_FILTER_MENU_LABELS[token.key]}: ${token.value}`,
    onRemove: () => onTokensChange(tokens.filter((item) => item.key !== token.key || item.id !== token.id)),
  }));
}
