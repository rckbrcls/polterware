import { dedupeScopeTokens, type ScopeFilterEnvironment, type ScopeFilterKey, type ScopeFilterNode, type ScopeFilterToken } from "./scope-filter";

export const SCOPE_FILTER_MENU_LABELS: Record<ScopeFilterKey, string> = {
  domain: "Domain",
  component: "Component",
  env: "Environment",
};

export type ScopeFilterMenuSection = {
  key: ScopeFilterKey;
  label: string;
  options: readonly { id: string; label: string }[];
};

/** Menu data is shared by every scoped page; environments are deliberately opt-in. */
export function scopeFilterMenuSections(input: {
  nodes: readonly ScopeFilterNode[];
  environments: readonly ScopeFilterEnvironment[];
  allowEnv: boolean;
}): ScopeFilterMenuSection[] {
  const sections: ScopeFilterMenuSection[] = (["domain", "component"] as const).map((key) => ({
    key,
    label: SCOPE_FILTER_MENU_LABELS[key],
    options: input.nodes.filter((node) => node.level === key).map((node) => ({ id: node.id, label: node.title })),
  }));
  if (input.allowEnv) {
    sections.push({
      key: "env",
      label: SCOPE_FILTER_MENU_LABELS.env,
      options: input.environments.map((environment) => ({ id: environment.id, label: environment.name })),
    });
  }
  return sections;
}

/** A scope menu option always toggles the shared token set; same-kind selections remain a union. */
export function toggleScopeFilterMenuToken(
  tokens: readonly ScopeFilterToken[],
  token: ScopeFilterToken,
  checked: boolean,
): ScopeFilterToken[] {
  return dedupeScopeTokens(
    checked
      ? [...tokens, token]
      : tokens.filter((item) => item.key !== token.key || item.id !== token.id),
  );
}
