# Local-first data layer — design

Status: plan of record, 2026-11-16. Epic T-382; this document is T-383.
Nothing here is implemented yet. Each section names the ticket that builds it.

## Problem

Every view in a project is its own server query. Keeping views consistent
needs reactivity keys, a `publish` list on every mutation, a per-view
`Atom.optimistic` wrapper with its own predict and confirm reducers, and
retained views that refetch whenever a key they listen to fires
(`docs/frontend/data-layer.md`). The cost shows up as code (the rules in that
document exist because each one was a bug) and as load: with live updates
(T-291) a single teammate edit refetched about 19 views on an open ticket page
before the fan-out fix, and about 6 after it.

The goal is a client that holds a synced local copy of each open project. Views
are queries over that copy, edits apply to it at once, and the server confirms
them. Navigation, filtering, grouping and stepping inside a project then need
no list requests, and most of the per-view machinery goes away.

## Evidence

A spike (branch `spike/T-291-tanstack-db`, TanStack DB `1.0.0-rc.1.5`) and a
Playwright benchmark against production builds with seeded projects of 300 and
5,000 tickets (`pp_bench`), medians, status grouping:

| Measure | Fixed live updates (#440) | Spike |
|---|---|---|
| Requests for 20 teammate edits, ticket page open (300 / 5,000) | 284 / 280 | 66 / 60 |
| Backend CPU for those edits (5,000) | 1,040ms | 490ms |
| J/K step (300 / 5,000) | 18 / 25ms | 26 / 28ms |
| Cold backlog paint (5,000) | 1,466ms | 1,569ms |
| First visit download (5,000, uncompressed) | 382 KB | 3.1 MB |

What this shows and doesn't:

- A shared local copy removes most repeated requests and backend work for
  other people's changes.
- It does not make stepping faster: #440 already preloads ten tickets ahead.
  Per-step load was mostly side data, fixed separately (PR #539).
- Cold backlog paint was a server problem (Postgres JIT on the sections query,
  680ms to 7ms in PR #538), not a client one.
- It does not show TanStack DB beats an Effect-native store on the same facts;
  that is T-388.

The spike's sync is not shippable: no durable log, the log position and rows
were read separately, and rows carried server-computed counts that go stale
when a neighbour changes.

## Decisions

| Area | Decision |
|---|---|
| Client store | Effect-native: SQLite in OPFS through `@effect/sql-sqlite-wasm`, views as `SqlClient.reactive` queries exposed as atoms, all behind `@/local`. TanStack DB is the fallback if T-388 shows the Effect-native store can't meet the requirements. |
| Sync engine | Our own, on a durable change log in Postgres. No Electric, PowerSync or Zero. |
| Crash recovery | The startup reconciler re-indexes from markdown and bumps the scope generation, forcing a full resync. No separate recovery journal. |
| Instances | Single backend instance. The log lives in Postgres so more instances stay possible later. |
| Offline writes | Later. Edits are intents with operation ids from the start so they can become offline-capable. |
| Descriptions | Loaded on demand and kept in the local cache, prefetched near where the user is. Upfront sync is a later per-shape switch. |
| Components | Keep feature atoms (`backlog(request)`, `ticketDetail(request)`); they read from live queries. |

## 1. Publication: every write is one change batch (T-384)

### Tables

| Table | Contents |
|---|---|
| `sync_scope` | Scope id (project, or a private user scope), generation, head sequence, oldest retained sequence. Keys use the immutable project and user ids, never slugs. |
| `sync_change` | `(scope, generation, sequence)`, operation id, ordered batch of fact upserts and tombstones. |
| `command_receipt` | Principal, operation id, request hash, outcome, id mappings for creates, committed sequence per scope (T-385). |

### Rules

- Sequence numbers are assigned in the final SQL transaction by locking the
  scope row and incrementing its head. The lock serialises publication per
  scope, so commit order equals sequence order. A reader at `after = N` can
  never miss a lower sequence that commits later, which a `bigserial` or a
  timestamp would allow.
- One command produces one batch, committed together with its index updates,
  activity effects and receipt. A ticket edit that also moves the ticket to
  another sprint is one batch, not two writes with a compensating write
  (today's path in `TicketCommands`).
- Cross-project moves lock both scopes in a fixed order and publish a deletion
  in the source and an insert in the destination in the same commit.
- If publication fails, the command fails or answers pending with its operation
  id. It never answers success without a committed batch. Today the index
  update can log and enqueue a repair instead (`TicketIndex.upsertTicket`).
- Every writer goes through one publication service in `server-core`: app
  commands, MCP and CLI tools, GitHub automation, imports, library, statuses,
  tags, membership changes and the reconciler. Silent activity is not silent
  replication.
- After a crash, or when the reconciler finds drift between markdown and the
  index, it re-indexes and bumps the generation. Clients on the old generation
  get `resetRequired` and take a fresh snapshot. Markdown stays the source of
  truth; losing sync history costs a resync, never content.
- `LISTEN/NOTIFY` after commit wakes the live stream, with a periodic head check
  for missed notifications. The in-memory replay buffer and random process
  epoch from #440 go.

## 2. Sync protocol (T-386)

| Operation | Contract |
|---|---|
| Bootstrap | Snapshot of a scope's facts from one repeatable-read database snapshot at head H. Keyset-paginated with a snapshot token; every page belongs to H. |
| Catch-up | `after = cursor` returns complete ordered batches, `next`, `head`, `hasMore`, bounded by size. A batch is never split. |
| Wake-up | The SSE stream announces that an authorised scope advanced. The client coalesces wake-ups and pulls; it also pulls on reconnect, on focus and periodically. No skipping of the client's own changes by origin. |
| Reset | A cursor from an old generation or older than retention (start at 30 days plus a size cap) answers `resetRequired`, never an empty delta. |

The client installs a snapshot atomically and keeps showing its previous copy
while a replacement downloads. A first visit shows loading, not an empty
project.

### Facts, not view rows

| Fact | Notes |
|---|---|
| Ticket | Id, title, status, type, priority, rank, estimate, assignee ids, tag ids, parent id, archived marker, revision, description revision. No parent title, no counts. |
| Relation edge | Blocked by, related, duplicate of, from the ticket that stores it. Reverse directions are derived. |
| Group | Sprint, epic, milestone, other: name, kind, dates, completed marker. Description lazy. |
| Group membership edge | Ticket in group. Completed sprints keep their membership. |
| Status | Slug, label, order, phase. |
| Tag, project settings | Settings needed by views (estimation mode, key). No secrets or admin-only configuration. |
| Member profile | Id, display name, avatar, role as permitted. |

Derived on the client: sub-ticket and done counts, open blocker counts, reverse
relations, sections, sprint grouping, estimate summaries. This removes the
spike's workaround of refetching parents and relation targets after a change,
which could never catch every affected neighbour.

Archived tickets sync as headers only (no descriptions or comments), so counts,
restore and relations stay correct without bulk history.

### Deletions, moves, access

- Deletions are explicit tombstones, never inferred from missing rows.
  Recreating a key gets a new revision so an old tombstone can't remove it.
- Access is checked on every snapshot page, pull and content fetch. GitHub-only
  fields are stripped in the serializer exactly as today
  (`server-core/src/tickets/TicketView.ts`).
- Losing access answers "no access"; the client purges that scope's rows,
  cursor and cached content. Logout purges everything for the user.
- A change in what a viewer may see (for example losing GitHub read access)
  invalidates the cursor, so the client re-snapshots a filtered copy instead of
  keeping fields it may no longer see.

## 3. Writes and settlement (T-385)

- The client sends commands as intents with an operation id: set status, add or
  remove an assignee, move relative to a neighbour, edit the description from a
  known revision. Not whole rows.
- Field edits carry expected revisions for the fields they change. Concurrent
  edits to other fields go through; an edit to the same field is a conflict.
- The server answers with a receipt holding the sequence per affected scope.
  The optimistic transaction stays until the local copy has applied the
  contiguous batches through that sequence, then the synced value and the
  release land together. That is what removes flicker, generically.
- A repeated operation id returns the stored receipt and changes nothing. A lost
  response is "outcome unknown": the client retries the same id or reads the
  receipt, never a new id.
- A rejected edit is removed and the view recomputed from synced facts plus
  later pending edits. A saved whole-row snapshot is never restored over a
  teammate's newer change.
- MCP and the CLI may omit the operation id and keep their current responses.

## 4. Client store (T-387, decided by T-388)

The preference is a fully Effect-native store. TanStack DB, which the spike
used, is the fallback if T-388 shows the Effect-native store can't meet the
requirements below.

### Storage

- SQLite (`@effect/wa-sqlite`) through `@effect/sql-sqlite-wasm`, opened with
  its OPFS worker inside a `SharedWorker`. Every tab talks to the one worker, so
  there is one connection and no cross-tab coordination to build. Where OPFS or
  `SharedWorker` is unavailable, an in-memory `SqliteClient` per tab, with no
  persistence.
- One database per server and user. Tables per fact kind (`tickets`,
  `relations`, `groups`, `group_members`, `statuses`, `tags`, `members`,
  `descriptions`), each keyed by scope, plus `sync_state` (scope, generation,
  cursor) and `pending_ops`. Migrations through `SqliteMigrator`; a schema
  version bump drops synced tables and re-snapshots, never `pending_ops`.
- Rows are plain columns and JSON derived from the sync schemas, with ISO date
  strings, so reads never decode Effect classes.
- Applying a sync batch is one SQLite transaction that writes its rows and the
  new cursor together. The cursor can't run ahead of the rows (the spike's bug),
  because they commit or roll back as one.
- Readiness and freshness are separate states: initializing; ready with a sync
  status (live, behind, offline, erroring); denied; failed. `waiting` stays the
  mutation signal only.

### Reads

- Views are SQL queries run through `SqlClient.reactive`, keyed by the tables
  they read. The client installs the driver's reactivity hooks, so SQLite update
  notifications invalidate those keys and the affected queries re-run. They are
  exposed as atoms, so feature atoms (`backlog(request)`, `ticketDetail(request)`)
  keep their shape and components don't change.
- Queries re-run rather than updating incrementally. SQLite with indexes on
  `(scope, status)`, `(scope, parent)`, membership and relation endpoints should
  keep that within a frame at our sizes; T-388 measures it at 5k, 50k and 100k
  tickets. Re-runs are scoped by table and debounced per animation frame.
- Counts, sections, reverse relations, open blockers and estimate summaries are
  SQL (`GROUP BY`, joins), not server fields.
- The shared filter model compiles to SQL `WHERE` clauses. `matchesTicketQuery`
  stays as a parity oracle in tests.
- Sorting uses the server's sort keys (`localOrderKey`, code-point order via
  `COLLATE BINARY`).
- Sprint sections reuse `backlogSprintSections` and the server's exclusive-claim
  rule. Time-dependent sprint state re-derives at sprint boundaries.
- J/K keeps today's semantics: the order is captured on entering the ticket page
  and frozen until leaving.

### Optimistic edits

- An edit inserts its intent into `pending_ops` and applies it to an overlay
  (`ticket_overlay` and similar per fact kind) in one transaction. Views read
  through SQL views that prefer overlay values over synced ones, so every view
  shows the edit at once.
- When a sync batch reaches the receipt's sequence, the same transaction that
  writes the synced rows deletes that operation's overlay and pending row.
  Settling and the new synced values land together, so nothing flickers.
- A rejected edit deletes its overlay and pending row, and the overlay is rebuilt
  from the remaining pending intents over the synced rows. A whole-row snapshot
  is never restored over a teammate's newer change.
- Effect runs the command, retries with the same operation id on unknown
  outcomes, and maps errors for the UI.

## 5. Content: descriptions, comments, activity (T-391)

- A description is its own cached fact with a revision, separate from the
  ticket's fields (today `TicketDetail` repeats every `Ticket` field). The
  server returns the current description with its revision; the client ignores
  anything older than what it holds.
- Prefetch: tickets around the J/K position, the current sprint and recently
  viewed tickets. Cached within a size budget, least recently used evicted
  first; unsaved drafts and descriptions with pending edits are never evicted.
- When a batch moves a ticket's description revision, the client refetches it
  only if it holds that description.
- Editing: Lexical keeps keystrokes locally as today. Saves are debounced into
  the description overlay so other views and tabs see the text at once, and
  queued saves of the same description merge into one server write. An edit carries its base
  revision; a concurrent change merges three-way when the edits don't overlap,
  otherwise the draft is kept for the user to resolve (continues PR #446).
- Comments and activity load when the user settles on a ticket (PR #539), recent
  page first, older pages on demand, cached with edits and deletes applied from
  the log.
- Full-text search over descriptions and comments stays a server query.

## 6. Private and org data (T-392)

Inbox rows and the user's own subscription and read state sync in a private
user scope, never in a project scope. The server still computes fan-out, unread
counts and reasons. "My tickets", the dashboard and cross-project search stay
server queries; they may cache their last response and revalidate.

## 7. Large projects (T-393)

Starting budgets, to be validated by T-388: one active project hydrated plus up
to two warm ones; about 100 MiB of in-memory project data; about 20 MiB of
cached content; persistent cache at most 200 MiB or 20% of available quota.
Projects above budget keep today's server-paged views, chosen per project before
bootstrapping. Rows are never silently evicted from a project shown as complete.

## 8. Endpoints

| Today | End state |
|---|---|
| `sections`, `sprintSections`, `epicSections`, `parentSections`, `count`, `titles`, project `list`, `sequence` | Not called by the app in local mode. Removed after a consumer audit once the large-project fallback no longer needs them (T-394). |
| `tickets.get`, group and project detail | Kept for MCP, the CLI and fallback; the app composes facts with on-demand content. |
| Statuses, tags, members, library lists | Local once synced; management endpoints stay. |
| Comments, activity, subscribers | Paged reads stay; cached slices update from the log. |
| `textSearch`, org-wide reads, `movedTo`, integration and admin reads | Server queries. |
| Commands | Stay; gain operation ids, receipts and expected revisions. No raw collection CRUD endpoint. |

## 9. Migration

A flag chooses the data owner per project session, never per component, so the
old view wrappers and the local copy never both own optimism for the same data.

| Step | Ships | Ticket |
|---|---|---|
| 1 | Publication service, change log, receipts; old UI unchanged, live stream driven by the log | T-384, T-385 |
| 2 | Sync endpoint | T-386 |
| 3 | Shadow local copy: read-only, compared against server outputs | T-387 |
| 4 | Store decision with numbers | T-388 |
| 5 | Status backlog and board, reads and writes together | T-389 |
| 6 | All other planning views and J/K order | T-390 |
| 7 | Ticket page and content cache | T-391 |
| 8 | Inbox and private state | T-392 |
| 9 | Large-project fallback | T-393 |
| 10 | Remove the per-view layer; rewrite `data-layer.md`, `data-fetching-policy.md` and the optimistic-updates skill | T-394 |

Until step 10, `docs/frontend/data-layer.md` and `data-fetching-policy.md` stay
authoritative for views not yet migrated. For migrated views, these rules are
replaced: rule 5 ("optimism is per view, never normalise entities into a
store"), rules 3, 6, 8 and 13 (reactivity keys and wrapper refresh), and the
retention policy for their reads.

## 10. Risks and the experiment that retires each

| Risk | Experiment | Ticket |
|---|---|---|
| A saved write missing from the log, or sequence gaps | Fault injection around file writes and the publication transaction; concurrent writers property test; restart and retry with the same operation id | T-384, T-385 |
| Snapshot and catch-up disagree | Property test: catching up from any retained cursor equals a fresh snapshot at the same head | T-386 |
| Field leaks after an access change | Downgrade and removal during snapshot paging and pulls | T-386, T-387 |
| Re-run cost of reactive SQL queries | Several mounted views over 5k, 50k and 100k tickets with a stream of remote changes; long tasks and frame time | T-388 |
| Overlay correctness | Random sequences of local intents, remote batches, settles and rejections; views always equal synced facts plus remaining intents | T-388 |
| Store choice | Same facts through the Effect-native store and TanStack DB at 5k, 50k and 100k tickets; parity with server logic over random edits | T-388 |
| Browser storage | Chromium, Firefox, Safari, private mode, quota exhaustion, two tabs, logout | T-387 |
| Real user speed | Benchmark against the baseline with #538 and #539: p50/p95 paint, long tasks, compressed transfer, heap, backend CPU, replica lag | T-389 |

## Out of scope

- Offline writes and a durable client command queue.
- Multiple backend instances and a fenced markdown writer.
- Syncing every description upfront and local full-text search.
- Third-party sync engines.
- Real-time co-editing of descriptions.

## Sources

Two independent drafts (Claude; GPT-6 Astra) reconciled into this document.
Astra's draft contributed the publication boundary, facts instead of view rows,
single-snapshot bootstrap, receipts and the store experiment. The simplifications
in the Decisions table were chosen over its fuller recovery journal, fenced
writer and versioned body cache. Both drafts recommended TanStack DB; the
Effect-native store was chosen afterwards as the preference, with TanStack DB as
the measured fallback.
