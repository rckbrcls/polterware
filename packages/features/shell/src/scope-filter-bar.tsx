import { For, createMemo, createSignal } from "solid-js";
import {
  ActiveFilterBar,
  Box,
  Boxes,
  Cloud,
  FilterChip,
  FilterPopover,
  Layers,
  Popover,
  SearchBar,
  type FilterPopoverGroup,
} from "@polterware/frontend-design-system";
import type { EnvironmentItem, ScopeNodeItem } from "./types";
import {
  dedupeScopeTokens,
  resolveScopeToken,
  splitScopeFilterInput,
  suggestScopeFilter,
  type ScopeFilterCatalog,
  type ScopeFilterKey,
  type ScopeFilterSuggestion,
  type ScopeFilterToken,
} from "./scope-filter";
import "./scope-filter-bar.css";

const KEY_LABEL: Record<ScopeFilterKey, string> = {
  system: "System",
  domain: "Domain",
  component: "Component",
  env: "Environment",
};

function KeyIcon(props: { kind: ScopeFilterKey }) {
  const icon = () => {
    if (props.kind === "system") return Boxes;
    if (props.kind === "domain") return Layers;
    if (props.kind === "component") return Box;
    return Cloud;
  };
  const Icon = icon();
  return <Icon size={14} />;
}

export function ScopeFilterBar(props: {
  tokens: readonly ScopeFilterToken[];
  nodes: readonly ScopeNodeItem[];
  environments: readonly EnvironmentItem[];
  allowEnv: boolean;
  onTokensChange: (tokens: ScopeFilterToken[]) => void;
}) {
  const [draft, setDraft] = createSignal("");
  const [focused, setFocused] = createSignal(false);
  const [dismissed, setDismissed] = createSignal(false);
  const [active, setActive] = createSignal(0);
  let anchor: HTMLDivElement | undefined;

  const catalog = createMemo((): ScopeFilterCatalog => ({
    nodes: props.nodes,
    environments: props.environments.map((environment) => ({ id: environment.id, name: environment.name })),
    allowEnv: props.allowEnv,
  }));

  const suggestions = createMemo(() =>
    suggestScopeFilter(draft(), { ...catalog(), tokens: props.tokens }),
  );

  const open = () => focused() && !dismissed() && suggestions().length > 0;

  function replaceTokens(next: readonly ScopeFilterToken[]) {
    props.onTokensChange(dedupeScopeTokens(next));
  }

  function choose(suggestion: ScopeFilterSuggestion) {
    setDismissed(false);
    if (suggestion.kind === "key") {
      setDraft(`${suggestion.key}:`);
      setActive(0);
      return;
    }
    replaceTokens([...props.tokens, { key: suggestion.key, value: suggestion.label, id: suggestion.id }]);
    setDraft("");
    setActive(0);
  }

  function onInput(value: string) {
    setDismissed(false);
    const live = splitScopeFilterInput(value);
    if (live.tokens.length === 0) {
      setDraft(value);
      setActive(0);
      return;
    }
    const resolved: ScopeFilterToken[] = [];
    const failed: string[] = [];
    for (const token of live.tokens) {
      const match = resolveScopeToken(token, catalog());
      if (match) resolved.push(match);
      else failed.push(`${token.key}:${token.value}`);
    }
    if (resolved.length > 0) replaceTokens([...props.tokens, ...resolved]);
    setDraft([...failed, live.draft].filter((part) => part !== "").join(" "));
    setActive(0);
  }

  function onKeyDown(event: KeyboardEvent) {
    const items = suggestions();
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (items.length === 0) return;
      event.preventDefault();
      setDismissed(false);
      const count = items.length;
      setActive((current) => (current + (event.key === "ArrowDown" ? 1 : -1) + count) % count);
      return;
    }
    if (event.key === "Escape") {
      setDismissed(true);
      return;
    }
    if (event.key === "Backspace" && draft() === "" && props.tokens.length > 0) {
      event.preventDefault();
      replaceTokens(props.tokens.slice(0, -1));
      return;
    }
    if (event.key === "Enter") {
      const current = items[active()] ?? items[0];
      if (!current) return;
      event.preventDefault();
      choose(current);
    }
  }

  function toggleValue(key: ScopeFilterKey, id: string, label: string, checked: boolean) {
    if (checked) {
      replaceTokens([...props.tokens, { key, id, value: label }]);
      return;
    }
    replaceTokens(props.tokens.filter((token) => token.key !== key || token.id !== id));
  }

  const groups = (): FilterPopoverGroup[] => {
    const keys: ScopeFilterKey[] = props.allowEnv
      ? ["system", "domain", "component", "env"]
      : ["system", "domain", "component"];
    return keys.flatMap((key) => {
      const options = suggestScopeFilter(`${key}:`, { ...catalog(), tokens: [] }).flatMap((suggestion) =>
        suggestion.kind === "value" ? [suggestion] : [],
      );
      if (options.length === 0) return [];
      return [{
        id: key,
        label: KEY_LABEL[key],
        leading: <KeyIcon kind={key} />,
        selectionMode: "multiple" as const,
        options: options.map((option) => ({
          id: option.id,
          label: option.label,
          leading: <KeyIcon kind={key} />,
          checked: props.tokens.some((token) => token.key === key && token.id === option.id),
          onCheckedChange: (checked: boolean) => toggleValue(key, option.id, option.label, checked),
        })),
      }];
    });
  };

  const placeholder = () =>
    props.allowEnv ? "system:, domain:, component:, env:" : "system:, domain:, component:";

  return (
    <div
      class="pw-scope-filter [-webkit-app-region:no-drag]"
      onKeyDown={onKeyDown}
      onFocusIn={(event) => {
        const target = event.target;
        if (target instanceof HTMLElement && target.closest("input")) {
          setFocused(true);
          setDismissed(false);
        }
      }}
      onFocusOut={(event) => {
        const next = event.relatedTarget;
        if (next instanceof Node && event.currentTarget.contains(next)) return;
        setFocused(false);
      }}
    >
      <ActiveFilterBar
        aria-label="Scope filters"
        items={props.tokens.map((token) => ({
          id: `${token.key}:${token.id}`,
          label: `${token.key}: ${token.value}`,
          onRemove: () =>
            replaceTokens(props.tokens.filter((item) => item.key !== token.key || item.id !== token.id)),
        }))}
        onClear={props.tokens.length > 0 ? () => replaceTokens([]) : undefined}
      />
      <div class="min-w-0 shrink-0" ref={(element) => { anchor = element; }}>
        <SearchBar
          placeholder={placeholder()}
          aria-label="Filter by scope"
          value={draft()}
          onInput={onInput}
        />
      </div>
      <FilterPopover
        ariaLabel="Browse scope"
        title="Scope"
        active={props.tokens.length > 0}
        onClear={() => replaceTokens([])}
        groups={groups()}
      />
      <Popover
        open={open()}
        onClose={() => setDismissed(true)}
        anchorRef={() => anchor}
        placement="bottom-start"
        width={280}
        autoFocus={false}
        title="Scope suggestions"
      >
        <div class="pw-scope-filter-suggestions" role="listbox" aria-label="Scope suggestions">
          <For each={suggestions()}>
            {(suggestion, index) => (
              <FilterChip
                class="pw-scope-filter-suggestion"
                selected={active() === index()}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActive(index())}
                onClick={() => choose(suggestion)}
              >
                <KeyIcon kind={suggestion.key} />
                <span class="min-w-0 truncate">
                  {suggestion.kind === "key" ? `${suggestion.label}:` : suggestion.label}
                </span>
              </FilterChip>
            )}
          </For>
        </div>
      </Popover>
    </div>
  );
}
