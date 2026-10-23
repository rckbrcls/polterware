import { describe, expect, it } from "vitest";
import {
  decisionState,
  mapVerdicts,
  mapConnections,
  mapEvidence,
  mapEnvironments,
  mapIntegrationResources,
  mapKnowledgeEntityLinks,
  mapCanonEntities,
  mapProjectRepos,
  mapProjects,
  mapProviders,
  mapSettings,
  mapSettingsEnvironments,
  mapSyncRuns,
  mapViews,
} from "./map-records";

const environments = [
  { id: "env-prod", name: "Production", kind: "production" as const, projectId: "p1" },
  { id: "env-dev", name: "Development", kind: "development" as const, projectId: "p1" },
  { id: "env-other", name: "Other", kind: "staging" as const, projectId: "p2" },
];

describe("mapEnvironments", () => {
  it("keeps the four known kinds and drops everything else", () => {
    const mapped = mapEnvironments([
      { id: "a", name: "A", kind: "production", projectId: "p" },
      { id: "b", name: "B", kind: "staging", projectId: "p" },
      { id: "c", name: "C", kind: "development", projectId: "p" },
      { id: "d", name: "D", kind: "local", projectId: "p" },
      { id: "e", name: "E", kind: "qa", projectId: "p" },
      { id: "f", name: "F" },
    ]);
    expect(mapped.map((item) => item.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("tolerates non-string fields without throwing", () => {
    expect(mapEnvironments([{ id: 5, name: null, kind: "local", projectId: undefined }])).toEqual([
      { id: "", name: "", kind: "local", projectId: "" },
    ]);
  });
});

describe("mapProjects", () => {
  it("summarizes the production environment and flags the current project", () => {
    const [first, second] = mapProjects(
      [
        { id: "p1", name: "Alpha", rootPath: "/work/alpha", createdAt: "2026-01-01T00:00:00Z" },
        { id: "p3", rootPath: "/work/none" },
      ],
      environments,
      "p1",
    );
    expect(first).toMatchObject({ projectId: "p1", name: "Alpha", directory: "/work/alpha", environmentSummary: "Production", isCurrent: true });
    expect(second).toMatchObject({ projectId: "p3", name: "p3", environmentSummary: "No environments", isCurrent: false });
  });

  it("falls back to the first environment when there is no production one", () => {
    const [project] = mapProjects([{ id: "p2", name: "B" }], environments, undefined);
    expect(project?.environmentSummary).toBe("Other");
  });
});

describe("mapSettingsEnvironments", () => {
  it("normalizes protection and derives its rules", () => {
    const mapped = mapSettingsEnvironments(
      [
        { id: "1", name: "Production", kind: "production", protection: "strict", isDefault: true },
        { id: "2", name: "Development", kind: "development", protection: "relaxed" },
        { id: "3", name: "Local", kind: "local", protection: "surprise" },
        { id: "4", name: "Bogus", kind: "nope" },
      ],
    );
    expect(mapped.map((item) => item.protection)).toEqual(["strict", "relaxed", "standard"]);
    expect(mapped[0]?.isDefault).toBe(true);
    expect(mapped[1]?.isDefault).toBe(false);
    expect(mapped[0]?.protectionRules.some((rule) => rule.includes("Freeze window"))).toBe(true);
    expect(mapped[1]?.protectionRules).toContain("Local changes are allowed");
  });
});

describe("mapSettings", () => {
  it("uses the project name and falls back to the project id, then to a placeholder", () => {
    expect(mapSettings({ projectId: "p1", description: "d", defaultEnvironmentId: "e", repository: "r" }, { name: "Alpha" })).toMatchObject({
      name: "Alpha",
      description: "d",
      defaultEnvironmentId: "e",
      repository: "r",
    });
    expect(mapSettings({ projectId: "p1" }, undefined).name).toBe("p1");
    expect(mapSettings({}, undefined).name).toBe("Project");
  });
});

describe("mapProjectRepos", () => {
  it("requires both a name and a path", () => {
    expect(
      mapProjectRepos([
        { id: "1", name: "api", path: "/work/api" },
        { id: "2", name: "web" },
        { id: "3", path: "/work/x" },
        {},
      ]),
    ).toEqual([{ id: "1", name: "api", path: "/work/api" }]);
  });
});

describe("mapCanonEntities and mapKnowledgeEntityLinks", () => {
  const entities = mapCanonEntities([
    { id: "e1", kind: "component", refKind: "atlas", refId: "core/import", title: "Import" },
    { id: "e2", kind: "resource", refId: "res-1", title: "DB", truthClass: "observed", source: "aws" },
  ]);

  it("defaults the truth class and source", () => {
    expect(entities[0]).toMatchObject({ truthClass: "declared", source: "polterware" });
    expect(entities[1]).toMatchObject({ truthClass: "observed", source: "aws" });
  });

  it("groups links by knowledge item and survives an unknown entity", () => {
    const grouped = mapKnowledgeEntityLinks(
      [
        { id: "l1", knowledgeId: "k1", entityId: "e1", predicate: "documents" },
        { id: "l2", knowledgeId: "k1", entityId: "e2", predicate: "runs_on" },
        { id: "l3", knowledgeId: "k2", entityId: "ghost", predicate: "documents" },
      ],
      entities,
    );
    expect(grouped.get("k1")?.map((link) => link.entityTitle)).toEqual(["Import", "DB"]);
    expect(grouped.get("k2")?.[0]).toMatchObject({ entityTitle: "ghost", entityKind: "", entityRefId: "" });
  });
});

describe("decisionState", () => {
  it.each([
    ["proposed", "proposed"],
    ["active", "active"],
    ["challenged", "challenged"],
    ["superseded", "superseded"],
    ["accepted", "active"],
    ["  ACTIVE ", "active"],
    ["", "proposed"],
    ["rejected", "proposed"],
  ])("reads %j as %s", (status, expected) => {
    expect(decisionState(status)).toBe(expected);
  });
});

describe("mapVerdicts", () => {
  const items = [
    { id: "verdict-a", kind: "verdict", title: "Verdict 0001: Local SQLite", status: "active", extraJson: JSON.stringify({ reviewTrigger: "multi-user" }) },
    { id: "verdict-b", kind: "verdict", title: "Verdict 0002: Postgres", status: "proposed", extraJson: JSON.stringify({ supersededBy: "verdict-c" }) },
    { id: "verdict-c", kind: "verdict", title: "Verdict 0003: Hosted", status: "accepted", extraJson: JSON.stringify({ statusReason: "scale" }) },
    { id: "doc-1", kind: "evidence", tags: ["doc"], title: "Not an Verdict" },
  ];

  it("keeps only Verdicts and resolves supersession both ways", () => {
    const verdicts = mapVerdicts(items);
    expect(verdicts.map((verdict) => verdict.id)).toEqual(["verdict-a", "verdict-b", "verdict-c"]);
    expect(verdicts[1]?.supersededBy).toBe("Verdict 0003: Hosted");
    expect(verdicts[2]?.supersedes).toEqual(["Verdict 0002: Postgres"]);
    expect(verdicts[0]).toMatchObject({ reviewTrigger: "multi-user", state: "active" });
    expect(verdicts[2]).toMatchObject({ state: "active", statusReason: "scale" });
  });

  it("lists the live Atlas nodes that cite an Verdict by id or by number", () => {
    const verdicts = mapVerdicts(items, new Map(), [
      { path: "core/store", decisions: ["verdict-a"] },
      { path: "core/api", decisions: ["Verdict-0001"] },
      { path: "core/old", decisions: ["Verdict 1"], status: "removed" },
      { path: "core/other", decisions: ["Verdict-0009"] },
    ]);
    expect(verdicts[0]?.governs).toEqual(["core/store", "core/api"]);
    expect(verdicts[1]?.governs).toEqual([]);
  });
});

describe("mapEvidence", () => {
  const records = [
    { id: "d1", kind: "evidence", tags: ["doc"], title: "Guide", summary: "How to" },
    { id: "rb", kind: "evidence", tags: ["runbook", "ops"], title: "Restore" },
    { id: "s1", kind: "evidence", tags: ["source"], title: "README", extraJson: JSON.stringify({ path: "README.md" }) },
    { id: "v1", kind: "verdict", title: "Decision" },
  ];

  // The core sends protobuf JSON, which omits empty strings, so defaults apply to absent fields.
  it("maps every evidence item regardless of its tags and skips other kinds", () => {
    const items = mapEvidence(records);
    expect(items.map((item) => item.id)).toEqual(["d1", "rb", "s1"]);
    expect(items[1]).toMatchObject({ tags: ["runbook", "ops"], path: "", owner: "Platform" });
  });

  it("keeps the project-relative path of a file-backed item", () => {
    expect(mapEvidence(records)[2]).toMatchObject({ title: "README", path: "README.md" });
  });

  it("survives malformed extraJson", () => {
    const [item] = mapEvidence([{ id: "bad", kind: "evidence", title: "T", extraJson: "{not json" }]);
    expect(item).toMatchObject({ id: "bad", path: "" });
  });
});

describe("integrations mappers", () => {
  const providers = [
    { id: "github", name: "GitHub", category: "Source Control", authCommands: ["gh auth login"] },
    { id: "aws", name: "AWS", category: "Cloud" },
    { id: "odd", name: "Odd", category: "Mystery" },
  ];

  it("marks a provider connected only when it has a connection", () => {
    const connections = mapConnections([{ id: "c1", providerId: "github" }], providers, environments, []);
    const mapped = mapProviders(providers, connections);
    expect(mapped.map((provider) => provider.state)).toEqual(["connected", "ready", "ready"]);
    expect(mapped[0]?.transcript).toEqual(["$ gh auth login"]);
    expect(mapped[2]?.category).toBe("Source Control");
  });

  it("links resources to their connection and normalizes status and freshness", () => {
    const resources = mapIntegrationResources(
      [
        { id: "ir1", connectionId: "c1", name: "repo", environmentId: "env-dev" },
        { id: "ir2", connectionId: "c1", name: "bucket" },
        { id: "ir3", connectionId: "other", name: "x" },
      ],
      environments,
    );
    expect(resources[0]).toMatchObject({ environment: "Development" });
    expect(resources[1]).toMatchObject({ environment: "All" });

    const [connection, broken] = mapConnections(
      [
        { id: "c1", providerId: "github", status: "error", freshness: "stale", errorMessage: "boom", environmentId: "env-prod" },
        { id: "c2", providerId: "unknown-provider", status: "???", freshness: "???" },
      ],
      providers,
      environments,
      resources,
    );
    expect(connection).toMatchObject({ name: "GitHub", status: "error", freshness: "stale", error: "boom", environment: "Production", resourceCount: 2 });
    expect(broken).toMatchObject({ name: "unknown-provider", status: "connected", freshness: "fresh", error: undefined });
  });

  it("maps sync runs with a safe result default", () => {
    const [ok, bad] = mapSyncRuns([
      { id: "s1", connectionId: "c1", result: "partial", imported: 3, changed: 1 },
      { id: "s2", connectionId: "c1", result: "???" },
    ]);
    expect(ok).toMatchObject({ integrationId: "c1", result: "partial", imported: 3, changed: 1 });
    expect(bad).toMatchObject({ result: "success", imported: 0 });
  });
});

describe("mapViews", () => {
  it("counts members and omits empty optional fields", () => {
    const [full, bare] = mapViews([
      { id: "v1", name: "Core", members: [{ nodeId: "n1", name: "API", type: "api" }, { nodeId: "n2", name: "DB" }], tags: ["core"], owner: "Platform" },
      { id: "v2", name: "Empty" },
    ]);
    expect(full).toMatchObject({ id: "v1", nodeCount: 2, tags: ["core"], owner: "Platform" });
    expect(full?.members?.[1]).toEqual({ id: "n2", name: "DB", type: undefined, layer: undefined });
    expect(bare).toMatchObject({ nodeCount: 0, members: undefined, owner: undefined, purpose: undefined });
  });
});
