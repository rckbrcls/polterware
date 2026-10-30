import { describe, expect, it } from "vitest";
import {
  dedupeParsedScopeTokens,
  dedupeScopeTokens,
  environmentIds,
  matchesEnvironment,
  parseScopeFilter,
  resolveScopeToken,
  scopeFilterAllowsEnv,
  scopeNodeIds,
  serializeScopeFilter,
  splitScopeFilterInput,
  suggestScopeFilter,
  type ScopeFilterCatalog,
  type ScopeFilterNode,
  type ScopeFilterToken,
} from "./scope-filter";
import { scopeFilterMenuSections, toggleScopeFilterMenuToken } from "./scope-filter-menu-state";

const nodes: ScopeFilterNode[] = [
  { id: "auth", parentId: "", level: "domain", title: "Auth", path: "auth" },
  { id: "login", parentId: "auth", level: "component", title: "Login", path: "auth/login" },
  { id: "billing", parentId: "", level: "domain", title: "Billing", path: "billing" },
  { id: "cache", parentId: "", level: "component", title: "Cache", path: "cache" },
];

const environments = [
  { id: "env-prod", name: "Production" },
  { id: "env-stage", name: "Staging" },
];

const catalog: ScopeFilterCatalog = { nodes, environments, allowEnv: true };

describe("parseScopeFilter", () => {
  it("parses complete tokens in any order and keeps an incomplete tail as the draft", () => {
    expect(parseScopeFilter("domain:Billing component:Login comp")).toEqual({
      tokens: [
        { key: "domain", value: "Billing" },
        { key: "component", value: "Login" },
      ],
      draft: "comp",
    });
    expect(parseScopeFilter("domain:")).toEqual({ tokens: [], draft: "domain:" });
    expect(parseScopeFilter("dom")).toEqual({ tokens: [], draft: "dom" });
  });

  it("reads quoted values and round-trips them through serialization", () => {
    const parsed = parseScopeFilter('domain:"Auth Service" env:Production');
    expect(parsed.tokens).toEqual([
      { key: "domain", value: "Auth Service" },
      { key: "env", value: "Production" },
    ]);
    expect(parseScopeFilter(serializeScopeFilter(parsed.tokens))).toEqual({
      tokens: parsed.tokens,
      draft: "",
    });
  });

  it("dedupes a repeated key and value and keeps a repeated key with another value", () => {
    expect(dedupeParsedScopeTokens(parseScopeFilter("domain:Auth domain:auth domain:Billing").tokens)).toEqual([
      { key: "domain", value: "Auth" },
      { key: "domain", value: "Billing" },
    ]);
    expect(
      dedupeScopeTokens([
        { key: "domain", value: "Auth", id: "auth" },
        { key: "domain", value: "Auth again", id: "auth" },
        { key: "domain", value: "Billing", id: "billing" },
      ]),
    ).toEqual([
      { key: "domain", value: "Auth", id: "auth" },
      { key: "domain", value: "Billing", id: "billing" },
    ]);
  });
});

describe("splitScopeFilterInput", () => {
  it("keeps the segment being typed as the draft until whitespace commits it", () => {
    expect(splitScopeFilterInput("component:Lo")).toEqual({ tokens: [], draft: "component:Lo" });
    expect(splitScopeFilterInput("component:Login ")).toEqual({
      tokens: [{ key: "component", value: "Login" }],
      draft: "",
    });
    expect(splitScopeFilterInput("component:Login domain:")).toEqual({
      tokens: [{ key: "component", value: "Login" }],
      draft: "domain:",
    });
  });
});

describe("suggestScopeFilter", () => {
  it("suggests each matching key once, then that key's values", () => {
    expect(suggestScopeFilter("c", catalog).map((item) => item.label)).toEqual(["component"]);
    expect(suggestScopeFilter("", { ...catalog, allowEnv: false }).map((item) => item.label)).toEqual([
      "domain",
      "component",
    ]);
    expect(suggestScopeFilter("en", catalog).map((item) => item.label)).toEqual(["env"]);
    expect(suggestScopeFilter("en", { ...catalog, allowEnv: false })).toEqual([]);
    expect(suggestScopeFilter("component:", catalog).map((item) => item.label)).toEqual(["Cache", "Login"]);
    expect(suggestScopeFilter("domain:bi", catalog).map((item) => ({ kind: item.kind, label: item.label }))).toEqual([
      { kind: "value", label: "Billing" },
    ]);
  });

  it("hides a value that is already selected and still offers the key", () => {
    const tokens: ScopeFilterToken[] = [{ key: "domain", value: "Auth", id: "auth" }];
    expect(suggestScopeFilter("domain:", { ...catalog, tokens }).map((item) => item.label)).toEqual(["Billing"]);
    expect(suggestScopeFilter("d", { ...catalog, tokens }).map((item) => item.label)).toEqual(["domain"]);
  });
});

describe("scope node and environment matching", () => {
  const tokens: ScopeFilterToken[] = [
    { key: "domain", value: "Auth", id: "auth" },
    { key: "domain", value: "Billing", id: "billing" },
    { key: "env", value: "Production", id: "env-prod" },
    { key: "env", value: "Staging", id: "env-stage" },
  ];

  it("unions node tokens and includes a parent's children", () => {
    expect(scopeNodeIds(tokens, nodes)).toEqual(["auth", "login", "billing"]);
    expect(scopeNodeIds([{ key: "domain", value: "Auth", id: "auth" }], nodes)).toEqual(["auth", "login"]);
    expect(scopeNodeIds([{ key: "component", value: "Missing", id: "gone" }], nodes)).toEqual([]);
  });

  it("resolves typed names to ids and lists environment ids separately", () => {
    expect(resolveScopeToken({ key: "domain", value: "auth" }, catalog)).toEqual({
      key: "domain",
      value: "Auth",
      id: "auth",
    });
    expect(resolveScopeToken({ key: "env", value: "Production" }, { ...catalog, allowEnv: false })).toBeNull();
    expect(environmentIds(tokens)).toEqual(["env-prod", "env-stage"]);
  });

  it("matches any selected environment and keeps unscoped items visible", () => {
    const selected = environments;
    expect(matchesEnvironment(undefined, [])).toBe(true);
    expect(matchesEnvironment(["Staging"], selected)).toBe(true);
    expect(matchesEnvironment(["env-prod"], [environments[0]!])).toBe(true);
    expect(matchesEnvironment(["Development"], [environments[0]!])).toBe(false);
    expect(matchesEnvironment(["All"], selected)).toBe(true);
    expect(matchesEnvironment([], selected)).toBe(true);
  });

  it("offers env only on Structure, Knowledge Docs, and Activity", () => {
    expect(scopeFilterAllowsEnv("structure", "all")).toBe(true);
    expect(scopeFilterAllowsEnv("truth", "docs")).toBe(true);
    expect(scopeFilterAllowsEnv("activity", "all")).toBe(true);
    expect(scopeFilterAllowsEnv("truth", "facts")).toBe(false);
    expect(scopeFilterAllowsEnv("inbox", "all")).toBe(false);
  });
});

describe("scope filter menu groups", () => {
  it("keeps one shared multi-selection and only exposes environments where allowed", () => {
    const sections = scopeFilterMenuSections({
      nodes,
      environments,
      allowEnv: true,
    });
    expect(sections.map((section) => section.label)).toEqual(["Domain", "Component", "Environment"]);
    expect(toggleScopeFilterMenuToken([{ key: "domain", value: "Auth", id: "auth" }], {
      key: "domain", value: "Billing", id: "billing",
    }, true)).toEqual([
      { key: "domain", value: "Auth", id: "auth" },
      { key: "domain", value: "Billing", id: "billing" },
    ]);
    expect(scopeFilterMenuSections({ nodes, environments, allowEnv: false })
      .map((section) => section.label)).toEqual(["Domain", "Component"]);
  });
});
