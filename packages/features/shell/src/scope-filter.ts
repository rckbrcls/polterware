/** Typed scope tokens. Node keys are a union; `env` is a separate environment narrowing. */

export const SCOPE_FILTER_KEYS = ["system", "domain", "component", "env"] as const;

export type ScopeFilterKey = (typeof SCOPE_FILTER_KEYS)[number];

export type ParsedScopeToken = {
  key: ScopeFilterKey;
  value: string;
};

export type ScopeFilterToken = ParsedScopeToken & {
  id: string;
};

export type ScopeFilterNode = {
  id: string;
  parentId: string;
  level: "system" | "domain" | "component";
  title: string;
  path?: string;
};

export type ScopeFilterEnvironment = {
  id: string;
  name: string;
};

export type ScopeFilterCatalog = {
  nodes: readonly ScopeFilterNode[];
  environments: readonly ScopeFilterEnvironment[];
  allowEnv: boolean;
};

export type ScopeFilterSuggestion =
  | { kind: "key"; key: ScopeFilterKey; label: string }
  | { kind: "value"; key: ScopeFilterKey; id: string; label: string };

const NODE_KEYS = new Set<ScopeFilterKey>(["system", "domain", "component"]);

export function isScopeFilterKey(value: string): value is ScopeFilterKey {
  return (SCOPE_FILTER_KEYS as readonly string[]).includes(value);
}

/** Structure, Truth Docs, and Activity are the screens with an environment narrowing. */
export function scopeFilterAllowsEnv(section: string, tab = ""): boolean {
  if (section === "structure" || section === "activity") return true;
  return section === "truth" && tab === "docs";
}

function readSegments(input: string): { segments: string[]; trailingSpace: boolean } {
  const segments: string[] = [];
  let current = "";
  let quoting = false;
  let escaping = false;
  for (const char of input) {
    if (quoting) {
      if (escaping) {
        current += char;
        escaping = false;
        continue;
      }
      if (char === "\\") {
        escaping = true;
        continue;
      }
      if (char === '"') {
        quoting = false;
        continue;
      }
      current += char;
      continue;
    }
    if (char === '"' && current.endsWith(":")) {
      quoting = true;
      continue;
    }
    if (char === " " || char === "\t" || char === "\n") {
      if (current) {
        segments.push(current);
        current = "";
      }
      continue;
    }
    current += char;
  }
  if (current) segments.push(current);
  return { segments, trailingSpace: !quoting && /\s$/.test(input) };
}

function parseSegment(segment: string): ParsedScopeToken | null {
  const colon = segment.indexOf(":");
  if (colon <= 0) return null;
  const key = segment.slice(0, colon).trim().toLowerCase();
  const value = segment.slice(colon + 1).trim();
  if (!isScopeFilterKey(key) || value === "") return null;
  return { key, value };
}

/** Drops a repeated key/value pair. The same key with a different value stays (OR). */
export function dedupeParsedScopeTokens(tokens: readonly ParsedScopeToken[]): ParsedScopeToken[] {
  const seen = new Set<string>();
  const out: ParsedScopeToken[] = [];
  for (const token of tokens) {
    const identity = `${token.key}:${token.value.trim().toLowerCase()}`;
    if (seen.has(identity)) continue;
    seen.add(identity);
    out.push(token);
  }
  return out;
}

/** Drops a repeated key/id pair. Text-only tokens fall back to the value. */
export function dedupeScopeTokens<T extends { key: string; id?: string; value: string }>(
  tokens: readonly T[],
): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const token of tokens) {
    const identity = token.id
      ? `${token.key}:${token.id}`
      : `${token.key}:${token.value.trim().toLowerCase()}`;
    if (seen.has(identity)) continue;
    seen.add(identity);
    out.push(token);
  }
  return out;
}

function classify(segments: readonly string[], draftFromTail: boolean): {
  tokens: ParsedScopeToken[];
  draft: string;
} {
  const complete = draftFromTail ? segments.slice(0, -1) : segments;
  const tail = draftFromTail ? segments[segments.length - 1] ?? "" : "";
  const tokens: ParsedScopeToken[] = [];
  const leftover: string[] = [];
  for (const segment of complete) {
    const parsed = parseSegment(segment);
    if (parsed) tokens.push(parsed);
    else leftover.push(segment);
  }
  const draft = [...leftover, tail].filter((part) => part !== "").join(" ");
  return { tokens: dedupeParsedScopeTokens(tokens), draft };
}

/** Every complete `key:value` segment is a token. An incomplete tail is the draft. */
export function parseScopeFilter(input: string): { tokens: ParsedScopeToken[]; draft: string } {
  const { segments } = readSegments(input.trim());
  if (segments.length === 0) return { tokens: [], draft: "" };
  const last = segments[segments.length - 1] ?? "";
  const tailIsDraft = parseSegment(last) === null;
  return classify(segments, tailIsDraft);
}

/**
 * Typing split: the last segment stays the draft until the input ends with
 * whitespace, so `system:Au` can still suggest values.
 */
export function splitScopeFilterInput(input: string): { tokens: ParsedScopeToken[]; draft: string } {
  const { segments, trailingSpace } = readSegments(input);
  if (segments.length === 0) return { tokens: [], draft: "" };
  return classify(segments, !trailingSpace);
}

function quoteScopeValue(value: string): string {
  if (/[\s:"]/.test(value)) return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  return value;
}

export function serializeScopeFilter(tokens: readonly ParsedScopeToken[]): string {
  return dedupeParsedScopeTokens(tokens)
    .map((token) => `${token.key}:${quoteScopeValue(token.value)}`)
    .join(" ");
}

function allowedKeys(allowEnv: boolean): ScopeFilterKey[] {
  return allowEnv ? [...SCOPE_FILTER_KEYS] : SCOPE_FILTER_KEYS.filter((key) => key !== "env");
}

function valueRank(label: string, needle: string): number {
  if (!needle) return 0;
  const text = label.toLowerCase();
  if (text === needle) return 0;
  if (text.startsWith(needle)) return 1;
  return 2;
}

/** Keys while the draft has no finished key; values once the key is unique. Each key is offered once. */
export function suggestScopeFilter(
  draft: string,
  catalog: ScopeFilterCatalog & { tokens?: readonly ScopeFilterToken[] },
): ScopeFilterSuggestion[] {
  const text = draft.trim();
  const keys = allowedKeys(catalog.allowEnv);
  const colon = text.indexOf(":");
  if (colon < 0) {
    const needle = text.toLowerCase();
    return keys
      .filter((key) => needle === "" || key.startsWith(needle))
      .map((key) => ({ kind: "key" as const, key, label: key }));
  }
  const keyPart = text.slice(0, colon).trim().toLowerCase();
  const valuePart = text.slice(colon + 1).trim().toLowerCase();
  const exact = keys.find((key) => key === keyPart);
  const prefixed = keys.filter((key) => key.startsWith(keyPart));
  const key = exact ?? (prefixed.length === 1 ? prefixed[0] : undefined);
  if (!key) {
    return prefixed.map((item) => ({ kind: "key" as const, key: item, label: item }));
  }
  const taken = new Set(
    (catalog.tokens ?? []).filter((token) => token.key === key).map((token) => token.id),
  );
  if (key === "env") {
    return catalog.environments
      .filter((environment) => {
        if (taken.has(environment.id)) return false;
        if (!valuePart) return true;
        return (
          environment.name.toLowerCase().includes(valuePart) ||
          environment.id.toLowerCase().includes(valuePart)
        );
      })
      .sort(
        (left, right) =>
          valueRank(left.name, valuePart) - valueRank(right.name, valuePart) ||
          left.name.localeCompare(right.name),
      )
      .map((environment) => ({
        kind: "value" as const,
        key,
        id: environment.id,
        label: environment.name,
      }));
  }
  return catalog.nodes
    .filter((node) => {
      if (node.level !== key || taken.has(node.id)) return false;
      if (!valuePart) return true;
      return (
        node.title.toLowerCase().includes(valuePart) ||
        (node.path ?? "").toLowerCase().includes(valuePart)
      );
    })
    .sort(
      (left, right) =>
        valueRank(left.title, valuePart) - valueRank(right.title, valuePart) ||
        left.title.localeCompare(right.title),
    )
    .map((node) => ({ kind: "value" as const, key, id: node.id, label: node.title }));
}

function sameText(left: string, right: string): boolean {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

/** Resolves a typed value to one catalog id. Ambiguous or hidden keys resolve to nothing. */
export function resolveScopeToken(
  token: ParsedScopeToken,
  catalog: ScopeFilterCatalog,
): ScopeFilterToken | null {
  if (token.key === "env") {
    if (!catalog.allowEnv) return null;
    const matches = catalog.environments.filter(
      (environment) => sameText(environment.name, token.value) || sameText(environment.id, token.value),
    );
    if (matches.length !== 1) return null;
    const environment = matches[0];
    if (!environment) return null;
    return { key: "env", value: environment.name, id: environment.id };
  }
  const matches = catalog.nodes.filter(
    (node) =>
      node.level === token.key &&
      (sameText(node.title, token.value) ||
        sameText(node.path ?? "", token.value) ||
        sameText(node.id, token.value)),
  );
  if (matches.length !== 1) return null;
  const node = matches[0];
  if (!node) return null;
  return { key: token.key, value: node.title, id: node.id };
}

/**
 * Node tokens become one id list. A parent contributes itself and its children.
 * Repeated ids are dropped. `env` tokens are not node ids.
 */
export function scopeNodeIds(
  tokens: readonly ScopeFilterToken[],
  nodes: readonly ScopeFilterNode[],
): string[] {
  const known = new Set(nodes.map((node) => node.id));
  const children = new Map<string, string[]>();
  for (const node of nodes) {
    const list = children.get(node.parentId) ?? [];
    list.push(node.id);
    children.set(node.parentId, list);
  }
  const out: string[] = [];
  const seen = new Set<string>();
  const walk = (id: string) => {
    if (seen.has(id) || !known.has(id)) return;
    seen.add(id);
    out.push(id);
    for (const child of children.get(id) ?? []) walk(child);
  };
  for (const token of tokens) {
    if (!NODE_KEYS.has(token.key)) continue;
    walk(token.id);
  }
  return out;
}

export function environmentIds(tokens: readonly ScopeFilterToken[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const token of tokens) {
    if (token.key !== "env" || token.id === "" || seen.has(token.id)) continue;
    seen.add(token.id);
    out.push(token.id);
  }
  return out;
}

function unscopedEnvironment(value: string): boolean {
  const text = value.trim().toLowerCase();
  return text === "" || text === "all";
}

/**
 * Environment tokens are an OR. An empty selection matches everything.
 * An item with no environment stays visible.
 */
export function matchesEnvironment(
  itemValues: readonly string[] | undefined,
  selected: readonly ScopeFilterEnvironment[],
): boolean {
  if (selected.length === 0) return true;
  const values = (itemValues ?? []).map((value) => value.trim()).filter((value) => !unscopedEnvironment(value));
  if (values.length === 0) return true;
  const wanted = new Set<string>();
  for (const environment of selected) {
    wanted.add(environment.id.trim().toLowerCase());
    wanted.add(environment.name.trim().toLowerCase());
  }
  return values.some((value) => wanted.has(value.toLowerCase()));
}
