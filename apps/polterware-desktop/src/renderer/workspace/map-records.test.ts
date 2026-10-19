import { describe, expect, it } from "vitest";
import {
  decisionState,
  mapAdrs,
  mapConnections,
  mapDocuments,
  mapEnvironments,
  mapIntegrationResources,
  mapKnowledgeEntityLinks,
  mapPpmEntities,
  mapProjectRepos,
  mapProjects,
  mapProviders,
  mapRunbooks,
  mapSettings,
  mapSettingsEnvironments,
  mapSources,
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

describe("mapPpmEntities and mapKnowledgeEntityLinks", () => {
  const entities = mapPpmEntities([
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

describe("mapAdrs", () => {
  const items = [
    { id: "adr-a", kind: "adr", title: "ADR 0001: Local SQLite", status: "active", extraJson: JSON.stringify({ reviewTrigger: "multi-user" }) },
    { id: "adr-b", kind: "adr", title: "ADR 0002: Postgres", status: "proposed", extraJson: JSON.stringify({ supersededBy: "adr-c" }) },
    { id: "adr-c", kind: "adr", title: "ADR 0003: Hosted", status: "accepted", extraJson: JSON.stringify({ statusReason: "scale" }) },
    { id: "doc-1", kind: "doc", title: "Not an ADR" },
  ];

  it("keeps only ADRs and resolves supersession both ways", () => {
    const adrs = mapAdrs(items);
    expect(adrs.map((adr) => adr.id)).toEqual(["adr-a", "adr-b", "adr-c"]);
    expect(adrs[1]?.supersededBy).toBe("ADR 0003: Hosted");
    expect(adrs[2]?.supersedes).toEqual(["ADR 0002: Postgres"]);
    expect(adrs[0]).toMatchObject({ reviewTrigger: "multi-user", state: "active" });
    expect(adrs[2]).toMatchObject({ state: "active", statusReason: "scale" });
  });

  it("lists the live Atlas nodes that cite an ADR by id or by number", () => {
    const adrs = mapAdrs(items, new Map(), [
      { path: "core/store", decisions: ["adr-a"] },
      { path: "core/api", decisions: ["ADR-0001"] },
      { path: "core/old", decisions: ["ADR 1"], status: "removed" },
      { path: "core/other", decisions: ["ADR-0009"] },
    ]);
    expect(adrs[0]?.governs).toEqual(["core/store", "core/api"]);
    expect(adrs[1]?.governs).toEqual([]);
  });
});

describe("mapDocuments, mapRunbooks, mapSources", () => {
  const records = [
    { id: "d1", kind: "doc", title: "Guide", status: "draft", extraJson: JSON.stringify({ author: "Erick", environment: "prod" }) },
    { id: "d2", kind: "doc", title: "Public", status: "anything" },
    { id: "rb", kind: "runbook", title: "Restore", summary: "Bring it back", extraJson: JSON.stringify({ severity: "low", steps: ["a", "b"], service: "db" }) },
    { id: "s1", kind: "source", title: "README", extraJson: JSON.stringify({ path: "README.md" }) },
  ];

  // The core sends protobuf JSON, which omits empty strings, so defaults apply to absent fields.
  it("maps documents and treats any non-draft status as published", () => {
    const docs = mapDocuments(records);
    expect(docs.map((doc) => doc.id)).toEqual(["d1", "d2"]);
    expect(docs[0]).toMatchObject({ status: "draft", author: "Erick", environment: "prod", owner: "Platform" });
    expect(docs[1]).toMatchObject({ status: "published", environment: "All", author: "Project maintainer" });
  });

  it("prefers linked components over the values stored in extraJson", () => {
    const links = new Map([
      ["d1", [{ id: "l", entityId: "e", entityTitle: "Import", entityKind: "component", entityRefId: "core/import", predicate: "documents", truthClass: "declared", source: "polterware" }]],
    ]);
    const [doc] = mapDocuments(records, links);
    expect(doc?.componentIds).toEqual(["core/import"]);
    expect(doc?.componentNames).toEqual(["Import"]);
  });

  it("maps runbooks with a safe severity default", () => {
    const [runbook] = mapRunbooks(records);
    expect(runbook).toMatchObject({ id: "rb", objective: "Bring it back", severity: "low", steps: ["a", "b"], service: "db" });
    expect(mapRunbooks([{ id: "x", kind: "runbook", extraJson: JSON.stringify({ severity: "weird" }) }])[0]?.severity).toBe("high");
  });

  it("maps sources with their project-relative path", () => {
    expect(mapSources(records)).toMatchObject([{ id: "s1", title: "README", path: "README.md" }]);
  });

  it("survives malformed extraJson", () => {
    const [doc] = mapDocuments([{ id: "bad", kind: "doc", title: "T", extraJson: "{not json" }]);
    expect(doc).toMatchObject({ id: "bad", environment: "All" });
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
