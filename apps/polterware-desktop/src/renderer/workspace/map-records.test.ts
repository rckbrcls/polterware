import { describe, expect, it } from "vitest";
import {
  decisionState,
  mapDecisions,
  mapConnections,
  mapDocs,
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

  it("keeps description, status, and last activity only when the record has them", () => {
    const [project] = mapProjects(
      [{
        id: "p1",
        name: "Alpha",
        rootPath: "/work/alpha",
        description: "Workspace",
        status: "active",
        updatedAt: "2026-03-01T15:04:00Z",
      }],
      environments,
    );
    expect(project).toMatchObject({ description: "Workspace", status: "active" });
    expect(project?.lastActivity && project.lastActivity !== "—").toBeTruthy();

    const [bare] = mapProjects([{ id: "p9", name: "Bare", status: "nope" }], []);
    expect(bare?.description).toBeUndefined();
    expect(bare?.status).toBeUndefined();
    expect(bare?.lastActivity).toBeUndefined();
    expect(bare?.environmentSummary).toBe("No environments");
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
    { id: "e1", kind: "component", refKind: "structure", refId: "core/import", title: "Import" },
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

describe("mapDecisions", () => {
  const items = [
    { id: "decision-a", kind: "decision", title: "Decision 0001: Local SQLite", status: "active", extraJson: JSON.stringify({ reviewTrigger: "multi-user" }) },
    { id: "decision-b", kind: "decision", title: "Decision 0002: Postgres", status: "proposed", extraJson: JSON.stringify({ supersededBy: "decision-c" }) },
    { id: "decision-c", kind: "decision", title: "Decision 0003: Hosted", status: "accepted", extraJson: JSON.stringify({ statusReason: "scale" }) },
    { id: "doc-1", kind: "doc", docType: "doc", title: "Not a Decision" },
  ];

  it("keeps only Decisions and resolves supersession both ways", () => {
    const decisions = mapDecisions(items);
    expect(decisions.map((decision) => decision.id)).toEqual(["decision-a", "decision-b", "decision-c"]);
    expect(decisions[1]?.supersededBy).toBe("Decision 0003: Hosted");
    expect(decisions[2]?.supersedes).toEqual(["Decision 0002: Postgres"]);
    expect(decisions[0]).toMatchObject({ reviewTrigger: "multi-user", state: "active" });
    expect(decisions[2]).toMatchObject({ state: "active", statusReason: "scale" });
  });

  it("reads a principle from its level", () => {
    const [principle] = mapDecisions([{ id: "p", kind: "decision", title: "Local first", extraJson: JSON.stringify({ level: "principle" }) }]);
    expect(principle?.level).toBe("principle");
  });

  it("lists the live Structure nodes that cite a Decision by id or by number", () => {
    const decisions = mapDecisions(items, new Map(), [
      { path: "core/store", decisions: ["decision-a"] },
      { path: "core/api", decisions: ["Decision-0001"] },
      { path: "core/old", decisions: ["Decision 1"], status: "removed" },
      { path: "core/other", decisions: ["Decision-0009"] },
    ]);
    expect(decisions[0]?.governs).toEqual(["core/store", "core/api"]);
    expect(decisions[1]?.governs).toEqual([]);
  });
});

describe("mapDocs", () => {
  const records = [
    { id: "d1", kind: "doc", title: "Guide", summary: "How to" },
    { id: "rb", kind: "doc", docType: "runbook", tags: ["ops"], title: "Restore" },
    { id: "s1", kind: "doc", docType: "source", title: "README" },
    { id: "v1", kind: "decision", title: "Decision" },
  ];

  // The core sends protobuf JSON, which omits empty strings, so defaults apply to absent fields.
  it("maps every doc with its type and skips other kinds", () => {
    const items = mapDocs(records);
    expect(items.map((item) => item.id)).toEqual(["d1", "rb", "s1"]);
    expect(items[1]).toMatchObject({ tags: ["ops"], owner: "Platform" });
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
