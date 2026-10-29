package seed

// decisionsPolter proposes the repository's Decisions in order, so the store assigns
// Decision-0001 through Decision-0010. The store is their only home; bodies are the
// decision text.
const decisionsPolter = `---
polter: 1
summary: Record the Polterware Decisions
rationale: Polterware manages its own decisions, so the store starts from its recorded Decisions
---

### new: Open-source and Cloud boundary

Public source may include hosted-only UI. Local and self-hosted distributions hide unavailable routes. The hosted control plane is private. Project data contracts and import/export formats are public. Cloud subscriptions, invoices, metering, tenant provisioning, internal administration, and production infrastructure are not part of the self-hosted product.

### new: Single Desktop and optional Cloud connection

Polterware has one Desktop product, codebase, and distribution model. Polterware Community is the useful local open-source product and works without an account. The same Desktop may connect to Polterware Cloud through optional sign-in. Unavailable capabilities are hidden from routes, navigation, Commander, and commands instead of being represented by dead pages.

### new: Website and Web App repository boundary

polterware-web remains an active product repository and owns both the public Polterware Website and the future authenticated Polterware Web App. The Web App is not implemented merely because the Website exists. The cloud repository stays authoritative for identity, tenants, permissions, entitlements, billing, provisioning, and hosted project operations. Public or shared frontend code never grants hosted authorization.

### new: Product positioning and wedge

Category: Project Context and Change Intelligence for AI Coding. Stack: Desktop Electron and Solid, Go core, SQLite. The wedge is the Polterware Project Model with facts, evidence and provenance, deterministic import, the Context Compiler, stable MCP reads, a narrow Drift Checker, AgentRun audit, audited MCP writes, and the CLI. Not the product: an IDP or software catalog, AI memory as positioning, the architecture canvas as the thesis, generic RAG marketing, an Operations control plane.

### new: Post-wedge Cloud and enrichment boundary

Cloud is justified only by continuity and collaboration on the same project model: sync across machines, managed backup, membership, hosted MCP, and shared change history. Anti-features: AI memory as positioning, remote execution or provisioning, an Operations control plane, RAG or embeddings as the source of truth, chat as the primary Cloud product. Agents receive budgeted packages of the model. Git ingest prefers metadata and evidence, never full source-tree indexing. Cloud sync ships before Cloud AI enrichment.

### new: Polter format and relational Work model

Polter format is the agent to Polterware language: a small markdown dialect decoded by a deterministic parser in the Go core. The Polterware store is the source of truth, never a stored text blob. Cards, tasks, questions, and invariants are typed tables with ULID ids. Writes are partial and removal is explicit. Every applied operation is one append-only change_ops row. The five-document Work model is discontinued. CLI first, MCP next.

### new: Single local core process

The core, polterware serve, is the only process that opens the SQLite store. One core runs per database, enforced by a lock. It is a daemon with idle exit that any client can start or attach to, with a build handshake. Change events come from SQLite commit hooks, not call sites. MCP runs inside the core and polterware mcp is a stdio to HTTP bridge. CLI commands are thin clients.

### new: Structure nodes above Work cards

System, domain, and component are Structure nodes with contract lines. A feature stays a Work card and a task stays a Work task. A node parent is named by under. Status is derived on read: proposed, in progress, delivered, or drift, and Git does not move the stored card stage. Oracle is a deterministic packing of the graph to a token budget, with no model on the path. The Structure canvas shows this graph.

### new: Checkouts on Structure nodes and projections into checkouts

A node names its checkout and folder. A task may name its checkout, and a claim scope carries it, so scopes in different checkouts never overlap. Projections are written from the store and never read back: each Decision becomes a file in its governing checkout and one generated block in each checkout AGENTS.md. Edits made in a checkout are not imported; the next export replaces them. The renderer never touches the filesystem.

### new: Decision lifecycle

Four states: proposed, active, challenged, then active or superseded. History is never deleted; a newer decision supersedes an older one. Lifecycle data stays in extra_json and every move is audited in change_ops. Moves are Polter blocks. A challenge is a person or agent call, never automatic. Active and challenged decisions govern drift checks and AGENTS.md blocks. Governed nodes are derived from decisions citations.
`

// decisionStatusPolter moves the accepted Decisions to active. Decision-0006 through
// Decision-0010 stay proposed.
const decisionStatusPolter = `---
polter: 1
summary: Activate the accepted Polterware Decisions
rationale: Decision-0001 through Decision-0005 were accepted
---

### Decision-0001:
status: active

### Decision-0002:
status: active

### Decision-0003:
status: active

### Decision-0004:
status: active

### Decision-0005:
status: active
`
