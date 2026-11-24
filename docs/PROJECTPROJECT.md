# ProjectProject — Architecture

ProjectProject (PP) is a markdown-first project management tool: organizations, projects, tickets, sprints and epics, with GitHub branch and PR automation, integrations, an MCP server and the `pp` CLI. Project content lives in markdown files on disk; Postgres holds identity, access, integration state and rebuildable indexes.

This file describes the system as it is. Keep it current in the same PR as the change that makes it wrong. Describe shapes and boundaries, and point at the code for anything it enumerates — tools, endpoints, tables, env vars — so there is no second list to fall out of step. How we work, and the frontend conventions, live in `AGENTS.md`; the visual system lives in `DESIGN.md` and `PRODUCT.md`; running it lives in `README.md` and `docs/deploy.md`.

---

## Tech stack

| Layer              | Choice                                                                 |
| ------------------ | ---------------------------------------------------------------------- |
| Runtime            | Bun (backend, CLI), Node for frontend tooling                          |
| Monorepo           | Bun workspaces + Turborepo                                             |
| Core library       | Effect v4 (`effect`, `effect/http-api`, `effect/sql`, `effect/reactivity`) |
| Backend            | Effect `HttpApi`, schema-first, sharing one contract with the frontend |
| Database           | Postgres via Drizzle and Effect SQL                                    |
| Durable work       | Effect workflows on the Postgres-backed SQL workflow engine            |
| Auth               | Better Auth: GitHub, Google, Microsoft and magic-link sign-in, organizations, admin, JWT, OAuth provider for MCP and the CLI |
| Markdown storage   | `PROJECTS_DIR` on disk (bind-mounted in production)                    |
| Object storage     | Per-organization S3 connection for attachments and images              |
| Frontend           | React SPA on TanStack Router (Vite plugin), `@effect/atom-react`, TanStack Form |
| UI                 | shadcn/ui on Base UI, Fluid Functionalism components, Tailwind         |
| Editor             | Lexical with CommonMark/GFM import and markdown export                  |
| Tests              | `bun test` with `@effect/vitest` (aliased to `@voila.dev/effect-bun-test`) |
| Delivery           | Docker images on ghcr.io, nightly and stable release channels          |

---

## Local verification

`bun run dev:agent` starts an isolated worktree environment: a database and non-superuser owner on a dedicated shared agent-only Postgres 16 container, independent markdown and secrets, a synthetic PM fixture, and a Portless HTTPS origin. New resource names include the branch label and a short collision suffix, persisted for the environment's lifetime. The existing development Compose project is separate. Lifecycle metadata lives under the shared Git directory in `pp-agent/registry.json`; setup/migration/cleanup are serialized, restarts preserve edits, and cleanup is explicit. See [local agent verification](agent-development.md) for commands, ownership checks and recovery.

## Workspaces

Frontend Paraglide generation uses `src/paraglide` for Vite dev/build, `.cache/paraglide/typecheck` for typecheck and `.cache/paraglide/test` for tests. Compiler options live in `apps/frontend/project.inlang/paraglide.config.ts`; checks use separate outputs so they do not overwrite a running dev server's messages.

Packages use the `@pp/*` namespace.

| Workspace                       | Owns                                                                                           |
| ------------------------------- | ---------------------------------------------------------------------------------------------- |
| `apps/backend`                  | HTTP transport, Better Auth, runtime composition, integration hosts, the tool route, MCP       |
| `apps/frontend`                 | The React SPA, organized by feature (see `AGENTS.md`)                                          |
| `apps/cli`                      | `pp`, a CLI over the tool catalog with its own sign-in (see `apps/cli/README.md`)              |
| `packages/shared`               | The `HttpApi` contract, schemas, tagged errors, the tool catalog, pure domain logic            |
| `packages/access`               | Org and project roles, permission statements and data-dependent policies                       |
| `packages/db`                   | Drizzle schema, migrations and DB layers. All migrations live here                             |
| `packages/server-core`          | Domain services and live layers: projects, tickets, comments, markdown, access, storage, …    |
| `packages/integration-github`   | GitHub App auth, branches, PRs, webhooks, project git state                                    |
| `packages/integration-slack`    | Slack notifications and ticket link previews (see its README)                                  |
| `packages/integration-everhour` | Everhour time tracking (see its README)                                                        |
| `packages/integration-jira`     | Durable Jira Cloud project migration                                                           |
| `packages/ui`                   | Design-system primitives, theme tokens and their gallery; holds no translated strings          |

`@pp/shared` is the keystone: the backend implements its `HttpApi`, the frontend's typed client is derived from it, and the tool catalog in `packages/shared/src/tools` is served both over MCP and to the CLI.

Integration packages own provider behavior and reach PP through Effect host services that the backend supplies. Core never imports an integration package. Figma is the exception today and still lives in `server-core`.

---

## Data model

### What lives in markdown

```
<PROJECTS_DIR>/orgs/<org-slug>/
├── blocks/, types/                        # org-level library: blocks and ticket types
└── projects/<project-slug>/
    ├── project.md
    ├── tickets/<ticket-id>.md             # frontmatter, description, comments region
    ├── groups/<group-id>.md               # sprints and epics
    └── blocks/, types/                    # project-level library
```

The rule: markdown holds what is **portable and cheap** — anything a human would write or read, or another tool could use, expressed in a few characters. Postgres holds what is neither — data that is large, opaque or meaningless outside this instance. Losing the Postgres half costs a re-upload or a reindex, not information. See `docs/history/specs/2026-09-10-aesthetic-data-in-postgres-design.md`.

**`project.md`:**

```markdown
---
slug: design-system
name: Design System Rewrite
createdBy: github_42 # users.id from postgres, audit only
github: # the default repository, the first one connected
  repoOwner: woutervh
  repoName: design-system
githubRepos: # every connected repository, written when there is more than one
  - repoOwner: woutervh
    repoName: design-system
  - repoOwner: woutervh
    repoName: design-system-docs
branchTemplate: "{type}/{id}-{slug}" # default: feat/T-12-add-button
links: # labelled URLs shown on the About page, written when there are any
  - label: Staging
    url: https://staging.example.com
createdAt: 2025-11-04T10:00:00Z
---

# Design System Rewrite

A long-form description of the project lives here as markdown body.
This is what gets shown on the project landing page.
```

**`tickets/T-12.md`:**

```markdown
---
id: T-12
title: Add primary button component
status: in_progress # one of the project's statuses
type: feat # a type key the project has, or null for no type
rank: a0V # position in the project's manual order (fractional index)
branches: # omitted until a branch is linked
  - branch: feat/T-12-add-primary-button # the ticket's own branch
    base: main # what its pull request targets
    pr: 41
    prState: merged # open | closed | merged
    landed: true # its merge reached the default branch
  - branch: feat/T-12-polish # stacked on the branch above
    base: feat/T-12-add-primary-button
    pr: 42
    prState: open
    prDraft: true
ignoredBranches: # never linked automatically again
  - feat/T-12-spike
assignees: [github_88]
sprint: G-3 # the sprint it is planned in, open or completed; omitted in the backlog
blockedBy: [T-9] # can't start until T-9 is done; omitted when empty
relatedTo: [T-14] # omitted when empty
flag: # needs attention; omitted when not flagged, removed when the ticket finishes
  reason: Waiting on the customer's API key # markdown, optional
  by: github_88
  at: 2025-11-04T14:02:00Z
createdBy: github_42
createdAt: 2025-11-04T11:30:00Z
updatedAt: 2025-11-04T15:12:00Z
---

# Add primary button component

Description body in markdown. This is what Lexical reads/writes.
Code blocks, lists, tables, the works.
```

Ticket IDs are sequential per project. A project can also carry `formerKeys` in `project.md`: keys it used before. The `project_key` table claims current and former keys per org, so no other project can take one, and git text naming a former key (`T-12` on a branch or pull request) resolves to the current key through `resolveTicketId` in `packages/shared/src/tickets/references.ts`. Ticket lookups by id elsewhere use the current key only.

**Manual order.** `rank` gives every ticket one position in its project, compared byte-wise (`collate "C"`), ties broken by ticket id. Manual ordering is the default sort, and the sprint board always uses it; a ticket's `sprint` records membership only. A ticket update with `position: { after | before: <id> }` gets a new rank from the server, between that ticket and its neighbour. A ticket update with `sprint: <id> | null` sets the ticket's `sprint` in the same write: an id moves it into that open sprint, and `null` takes it out of an open sprint (a ticket left in a completed sprint stays there). A bulk update with `position` ranks all its tickets into that one gap, in their current order. List rows and board cards can be dragged between sections, and the drop sends one such update with the section's field and, under manual ordering, the position; dragging a row that is part of a multi-row selection moves the whole selection in one bulk update. Rows in a completed sprint stay put: they can't be dragged, and nothing can be dropped there. New tickets are ranked above the top ticket; split results go right below the original; a moved ticket goes on top in its new project. Rank assignment holds a per-project lock from reading the neighbours to updating the index, so concurrent creates and moves never share a rank; the id tiebreak only covers ranks copied by hand. On boot, before serving, the backend gives ticket files without a rank one (active sprint, then planned sprints, then the rest newest first, above the existing top) and rebuilds those projects' index.

**Sprints.** A sprint is a group file (`groups/<id>.md`, `kind: sprint`) with dates and no ticket list; each ticket names its one sprint in its own frontmatter, and the ticket index mirrors it as `ticket_index.sprint_id` (a difference counts as index drift), so sprint grouping, sprint filters and a sprint's `tickets` in the API are queries on that column. Adding tickets to a sprint, removing them, or moving one between sprints writes only those tickets and records `group_added` / `group_removed` activity on them. A completed sprint can't take new tickets. Completing a sprint writes a `snapshot` into its file: every ticket it held, with its status and, when it had one, its estimate at that moment. Unfinished tickets then move to the chosen sprint or to the backlog, and finished ones keep pointing at the completed sprint; a ticket reopened later stays there until someone plans it into another sprint. Deleting a sprint takes its tickets out of it. Epics, milestones and other groups keep a `tickets` list in their own file.

Older storage listed tickets in every sprint file, and a ticket could sit in one open sprint and several completed ones. The backend migrates that when it starts, before the rank backfill and before it accepts requests (`packages/server-core/src/groups/SprintMigration.ts`): each ticket gets the sprint it showed under (the open sprint that listed it, else the newest completed one), each completed sprint gets a snapshot from its list and the tickets' current status and estimate, and sprint files drop their lists. A ticket that already names a sprint is left alone and a sprint file without a list is skipped, so it is safe to run again; it logs the counts and rebuilds the ticket index of each project it changed.

**Moving a ticket to another project** in the same org gives it a new ID there; its sub-tickets move with it, and an epic that still has tickets can't be moved. A moved ticket, and each sub-ticket that moves with it, keeps its type when the destination project has that type and doesn't hide it, and has no type otherwise; an epic stays an epic. The move result lists, per ticket, the type, tags and assignees that were dropped, and the move dialog names them before the move. The file, its comments, attachments and activity move; the ticket leaves its sprint and epic, and keeps only the relations to tickets that move with it. The moved ticket lists every earlier location in its frontmatter, oldest first:

```yaml
movedFrom:
  - feedback/FB-12 # <project-slug>/<ticket-id>
```

The ticket index mirrors `movedFrom`, so an old URL redirects to the ticket and an old mention still resolves. Status, tags, assignees and the estimate are kept where the destination has them, and the branch link is kept when both projects use the same repository. Only a PM of the ticket's project can move it, into a project where they can create tickets.

A ticket mention is `mention:ticket/<id>` inside its own project and `mention:ticket/<project-slug>/<id>` across projects. A comment mention adds the comment id after the ticket part, as in `mention:comment/<id>/<comment-id>`, and links to that comment on the ticket. A move rewrites the ticket part of both kinds in the moved ticket and the mentions of it in its old project.

Relations live in the frontmatter of one ticket: the waiting ticket stores `blockedBy`, a duplicate stores `duplicateOf` (set when it is archived as a duplicate), and `relatedTo` stays on the ticket it was added from. The reverse directions ("blocking", "duplicates", the other side of "related") come from the `ticket_relation_index` table, which is rebuilt from frontmatter with the ticket index. Deleting a ticket leaves links to it in other files; reads hide them, and the next relation edit on the referencing ticket drops them.

**Library (`blocks/<key>.md`, `types/<key>.md`):** a block is a named, reusable piece of markdown; a ticket type holds a name, icon, colour, description, default priority and tags in its frontmatter, and its body is the type's starting description, which may reference blocks.

```yaml
---
name: Bug
icon: Bug
color: "#f16f7e"
description: Something is broken
priority: high # optional default for new tickets of this type
tags: [frontend] # optional default tags
---
<block type="steps-to-reproduce">

</block>
```

The library resolves in three layers: built in, then org, then project. The types Feature (`feat`), Bug (`bug`), Chore (`chore`) and Epic (`epic`) and seven blocks (`context`, `acceptance-criteria`, `out-of-scope`, `definition-of-done`, `expected-vs-actual`, `steps-to-reproduce`, `environment`) are built in: they are defined in `packages/shared/src/library/builtins.ts`, exist in every org without a file, and can't be deleted. A file with the same key in an org or a project overrides the layer below, so changing a built-in saves a copy and removing the copy restores it. The Ticket types settings (`settings/types` at org and project level, which calls blocks sections) show an entry from a lower layer read-only until someone chooses to change it for this layer, which saves that copy; deleting a project type that tickets use first moves those tickets to another type, or none, through the bulk ticket update. A project hides an entry from a lower layer with a tombstone file (`hidden: true`). Type keys are kebab-case, at most 48 characters, never `other`, `blank` or `none`, and fixed once created.

A ticket's `type` is the key of a type its project has (built in, the org's or the project's own) or `null` for no type; the ticket index stores the same value, and the list filter value `none` selects tickets without a type. Ticket queries take types to include (`type`), types to leave out (`excludeType`), or both; views that hide epics exclude the `epic` type, so a ticket of any other type, defined or not, stays in them. Setting a type the project doesn't have, or one the project hides, fails with `UnknownType`; a ticket that already carries a hidden or removed type keeps it and can still be edited. A ticket created with a type and no description starts with that type's starting description (hints stripped) and its default priority and tags, unless those are passed. Changing the type replaces the description with the new type's starting description only while the description is empty or still an untouched starting description; clearing the type leaves the description alone. A custom type is never an epic. The frontend shows a type with the name, icon and colour of the definition in the ticket's own project library (`apps/frontend/src/features/tickets/lib/ticketTypes.ts`): a hidden type keeps its look but is not offered in menus, and a key that no longer resolves shows as the key.

Every place that creates a ticket (the inline creators in the backlog, sections, sprints and sub-tickets, and the create dialog) has one type picker and no template choice. It starts on the type the viewer last used to create a ticket in that project, kept per viewer and project in the browser's localStorage (`apps/frontend/src/features/tickets/hooks/useLastUsedType.ts`); a place that can't hold an epic starts on no type instead, and a remembered type the project no longer offers falls back to no type. A line under the creator names the sections the chosen type starts with. On a ticket, the type menu links people who may manage the library to that type's settings page, an empty description offers the project's types as starting points (choosing one sets the type), and the `/` menu lists the sections the type starts with but the ticket lacks, then every other section. The description opens for reading: links open and checkboxes tick, but the text and its sections can't be changed. Edit, `E` or a click on the text (not on a link or a checkbox's box, and not after selecting text) switches it to editing on a raised sheet, with the caret where you clicked; Done, `Esc` or a click elsewhere on the page switches it back. Changes save as you type.

Older storage kept `templates/` folders and a default template per ticket type in `library.md` and `project.md`. Before accepting requests, the backend turns each default template into its type's file in the same layer and every other template into a type of its own, then removes the legacy folders and settings. It preserves existing type files so the migration can run again.

The backend also starts a background ticket type migration (`packages/server-core/src/library/LibraryMigration.ts`). It rewrites legacy `type: other` to `type: null`, preserves the rest of the file, and clears any legacy type values still in the ticket index. Postgres records completion after the index update succeeds, including after a scan with no file rewrites. Failed scans are retried on the next boot. Ticket reads already treat the legacy value as no type.

### What lives in Postgres

- **Identity and access:** Better Auth's tables, plus project membership, roles and invite grants.
- **User settings** (`user_settings`): one row per user, one typed column per setting (avatar source, editor preference, chip colors), read by `/me` and written through `PATCH /me/settings`. Choosing an avatar source also writes the resolved picture to `user.image`, so every avatar read stays a plain column read. The picture options come from the user's linked accounts (`apps/backend/src/auth/providerAvatar.ts`), and a later sign-in with the chosen provider refreshes `user.image`.
- **Indexes.** They mirror markdown so lists, filters and lookups don't parse every file, and they can be rebuilt from it. The project index also holds instance-local aesthetics such as banner images.
- **Project configuration that is instance-bound:** statuses, tags, git automation.
- **Integration state:** connections, OAuth state, encrypted credentials, links, and per-integration delivery records.
- **Per-user state about tickets:** who is subscribed to which ticket (`ticket_subscription`), including an explicit unsubscribe. Creating, commenting, being assigned and being mentioned subscribe you automatically. `TicketDocs` derives these subscriptions from the ticket before and after each write (`packages/server-core/src/subscriptions/intents.ts`) and stages them in the activity outbox, so they commit with the activity rows once the markdown write lands. An update with a later step that can still fail (the rest of a bulk edit) holds its batch: other writes leave held batches alone, and the update releases them when it finishes, committing on success and discarding them when the step failed and the ticket was put back, so a reverted change leaves no activity, subscription or inbox row. After a crash, recovery settles held batches by the content hash like any other. An unsubscribe holds against creating and commenting but not against a new assignment or mention. Subscriptions are deleted with the ticket or when the user leaves the project, and a move keeps the subscribers who are members of the destination.
- **Inbox rows** (`inbox_row`): one row per person per ticket with its open direct reasons (assigned, mentioned), the latest event and who caused it, an unread count, read or done state, and when it was last read. `TicketActivity.record` stages the ticket's inbox events next to its subscriptions (`packages/server-core/src/inbox/events.ts`), and the commit resolves direct reasons, delivers to direct recipients and subscribers (never the person acting or their agent, never imports or cleanup), marks the ticket read for whoever acted, and tells subscribers of waiting tickets when their last open blocker finishes or is archived. Your agent counts as you: its reply resolves your mention and its actions read the ticket, and the row records which agent read it. Opening a ticket page reads it (`PUT .../tickets/:id/read`). Rows move with the ticket like subscriptions and go with it when it is deleted.
- **Sidebar pins** (`sidebar_pin`): the tickets and sprints each person pins to their sidebar, per project, in their own fractional-index order (new pins go on top). Listing them reads the whole organization and silently drops pins whose ticket or sprint is gone or whose project the person can no longer read. A pin goes with its ticket when the ticket is deleted, with its project, and when the person leaves the organization; a deleted sprint's pin stays in the table but is never listed.
- **Durable work:** activity, outboxes and workflow engine state.

The tables themselves are in `packages/db/src/schema.ts`.

Adding a column for content a human writes is still a smell; it belongs in markdown.

---

## Surfaces

One set of services in `server-core` serves every surface. Handlers and tools stay thin.

- **Web app.** Marking a ticket as a duplicate opens a review after selecting the original. The dialog shows both tickets, lets the viewer swap which one will be archived, and opens the surviving original after confirmation. Cmd K composes the command registry with integration-owned commands derived from existing connection reads. Integration settings remain searchable; missing object storage and confirmed broken connections appear as setup suggestions, gated by the viewer's permissions. Organization, project and personal destinations keep their own scope. Cmd K also changes the preferred editor through the existing account mutation and links to personal connection setup and CLI/MCP instructions. GitHub App registration and installation run from command pages for organization admins; repository setup follows the project’s GitHub-write permission. Ticket branch creation and linking choose a connected repository, while stack commands and branch/PR links use the ticket’s repository. GitHub commands check their endpoint permissions through the same actors as the settings screens. The SPA calls `/api/*` through the client derived from `AppApi`, with a Better Auth session cookie. Sprint and backlog boards share keyboard navigation: Tab enters or leaves the board, arrows or H, J, K and L move among cards and column headers, F2 enters a card’s controls, and Escape returns to card navigation. Ticket lists move focus between rows with J and K (or the arrows), across sections and skipping collapsed ones; Space toggles a row's preview. Both work from anywhere on the page outside text fields and menus. Virtualized columns and lists reveal a target before focus moves to it. While keys drive focus, hover effects and the Cmd K pointed ticket ignore the row under a still cursor; the next real mouse movement releases focus that J or K placed, and the hovered ticket becomes the next starting point. Returning from a ticket page opened from a list or board focuses the last ticket viewed once it renders. The backlog retains the displayed view and grouping until the requested view’s query settles, so switching from the board to a cold list does not expose a loading placeholder. The router adapters in `apps/frontend/src/lib/searchParams.ts` delegate URL parsing and serialization to `URLSearchParams` and Effect `UrlParams`. Filters use repeated keys, while route-owned schemas in `features/tickets/lib/ticketSearch.ts` validate flat search state and convert it to the existing domain queries at the feature boundary. Router values stay strings or arrays of strings; default sorting is omitted from links. A ticket opened from a list or board carries its source in `from=sections` or `from=sprintBoard`, alongside that view's grouping, sprint and filters. Legacy JSON navigation context is discarded locally by the ticket search schema, so an old link can still open its ticket. Ticket links take their navigation context from the displayed result, including retained rows shown while a new filter request is pending. The ticket page asks the `sequence` endpoint once for that view's whole order (section order, then the view's sort, or manual order on a sprint board) as ids and titles; a ticket outside the view, or opened without one, steps through its parent's sub-tickets instead. The order stays frozen until the ticket page is left, so editing or archiving a ticket doesn't change where J goes next. J and K, held or tapped, move to the next ticket on the client at once: the page keeps the ten tickets ahead in the direction of travel and three behind in memory, filling thirty ahead whenever one of those is missing, and renders the stepped-to ticket from memory. Filling asks the `tickets/content` endpoint for up to 100 tickets at once and gets each one's detail, comments, first activity page, subscribers and sub-tickets in one response; the frontend preloads them into the read atoms by serialization key (`features/tickets/atoms/ticketContentFill.ts`), so a ticket shows complete on its first read and revalidates in the background. The same fill runs for the list rows and board cards on screen once they settle, for pinned tickets in the sidebar, for the highlighted ticket in Cmd K and its neighbours, and for a ticket's hover card. The first row or card a view shows also loads that view's sequence once, and a ticket opened from the view shows its place in it from that remembered order while its own sequence loads. Every read stays in memory for 30 idle minutes, and at most 300 filled tickets wait unread. When the tab is hidden or closed, the server values of the reads on screen are written to `localStorage` for that user and build, and a reload or return visit by the same signed-in user paints them before any request returns, then revalidates each one; signing out or signing in as someone else deletes them. A second after sign-in the app preloads its route chunks, rich-text editor and Markdown renderer. A second after a project opens it runs the route loaders of its sidebar destinations (organization overview, all projects, sprints, the active sprint, the board and each backlog grouping), so their first visit paints from memory. When a ticket or comment in the project changes, affected unread tickets on screen or in the stepping window are fetched again and affected offscreen preloads are dropped. Changes made elsewhere (another person, tab, the MCP server, the CLI, an import or a webhook) reach an open project through `GET /api/orgs/:orgSlug/projects/:slug/tickets/events`, a server-sent event stream the project layout follows while the tab is visible. Postgres triggers on `ticket_index`, `ticket_relation_index`, `ticket_branch`, `ticket_activity`, `comment_index`, `ticket_subscription`, `project_status`, `project_tag`, `project_git_automation`, `project_integration_link`, `project_member`, `member`, `organization` and `project_index` call `notify_project_change`, which sends `pg_notify('project_sync', …)` with the project id, a kind and the ticket id where the row has one, and a `ticket_index` write that moves a ticket between sprints also names the sprints it left and joined; writes of sprint and group files and ticket writes that change the comments region without touching a comment row, such as resolving a thread (both in `TicketActivity.record`), and of a project's description (in `Projects.update`) call it from the application. The backend listens once (`apps/backend/src/tickets/TicketEvents.ts`), collects each stream's changes for 50 ms and sends them as one JSON array; the app invalidates the reactivity keys they name, so ticket edits refresh lists and the retained reads for the ticket, its parent, children and relation peers, and re-runs the sidebar warm-up at most every 10 seconds. The first uninterrupted connection uses the reads already started by the route. A reconnect or return to a previously followed project invalidates every project read, since events may have been missed. The stream closes while the tab is hidden, carries an empty array every 25 seconds and is reopened after 60 seconds of silence; each account may hold 32 streams, and the session is checked again before every event. On a cold ticket open, the full-screen loader stays up until the ticket detail, project and primary property reads settle and the route can render the description. A warm ticket can paint from cache while it refreshes. Ticket descriptions render as Markdown until the reader starts editing. Checklists remain interactive. The ticket starts loading its editor code after the description paints. Pressing E or choosing Edit uses that same load and focuses the editor as soon as it is ready. The epic picker fetches its candidates when opened. The URL follows each tap, and while a key is held it follows at most every 310ms, within Safari's limit of 100 history updates per 30 seconds; the breadcrumb always shows the ticket on screen.
- **MCP.** A Streamable HTTP endpoint on the backend, authenticated through Better Auth's OAuth provider so each client acts as the consenting user. It serves the tool catalog, defined in `packages/shared/src/tools`. Ticket discovery reuses the web app’s ranked text search across unarchived titles, descriptions and comments. Separate read tools expose complete comment discussions and cursor-paginated activity through the existing services and project permissions.
- **CLI.** `pp` calls the same tool catalog over an HTTP tool route, with its own OAuth client, token audience and DPoP-bound tokens. It picks a default org and project, and keeps itself in step with the server's release.

The editor reads and writes markdown through `@lexical/mdast`. `MarkdownExtension` (`packages/ui/src/editor/markdown-extension.ts`) sets up CommonMark and GFM import and export: paragraphs, nested and task lists, block quotes, tables, code and ordinary images become editable Lexical nodes, and `mdast-util-to-markdown` writes them back with `*` emphasis, `-` rules, padded tables and CommonMark escapes in text and link destinations. Each feature extension carries its own import and export rules alongside its nodes: mentions, Figma and Paper embeds and attachments. Ticket blocks parse through a micromark construct in `blocks/ticket-block-markdown.ts` into `ticketBlock` nodes, and `@lexical/mdast` shortcuts plus the checklist and horizontal rule extensions handle typed markdown. The read view renders with `react-markdown` on `remark-parse` and `remark-gfm` (`markdown-parser.ts`). Code blocks paint their text and line numbers immediately. The syntax tokenizer loads when a code block specifies a language, and the same tokenizer supplies colors to the read view and the editor. Because export reformats markdown, a ticket's description counts as an untouched type default only when both sides match after the same import and export (`markdown-normalize.ts`), and server code that reads URLs or ids out of stored markdown unescapes destinations first (`unescapeMarkdown` in `@pp/shared`). Unsupported constructs such as footnotes remain literal text and save without accumulating escapes.

Link previews cache favicon rendering metadata alongside the title and icon URL. The server fetches icons through the same public-host and redirect checks as page metadata, with a byte limit and bounded image decoding. Only transparent, nearly uniform neutral symbols are marked monochrome; the frontend makes those dark or light with the active theme. Colored, opaque, mixed-tone and unrecognized images retain their original colors. Existing cached previews acquire this metadata lazily without refetching the page.

Tagged errors map to the same taxonomy on every surface. Each failure a caller handles differently is its own tagged error in `packages/shared/src/errors.ts`, carrying its data as fields (`UnknownType { key }`, `RelationInvalid { kind, ids }`); related failures share one error with a literal `kind`. Endpoints declare exactly the errors their handler can fail with. `Validation` is left for a few input checks the schema can't express. The frontend turns each error into copy through one exhaustive record keyed by `_tag` (`apps/frontend/src/lib/errorMessage.ts`), and the tool catalog does the same for agents (`toolErrorText.ts`).

---

## Access

Access lives in Postgres, not in markdown, at two levels:

- **Org roles** (`owner`, `admin`, `member`, `guest`) govern the org: its people, integrations and projects.
- **Project roles** (`pm`, `developer`, `client`) govern one project. One per person per project, and only people in the org can hold one.

What each role grants is defined in `packages/access/src/roles`: `org.ts` and `project.ts` hold the grants, and `effective.ts` combines them into a person's role on a project. Rules that depend on the data, such as comment authorship, ticket splits and sprint moves, live in `packages/access/src/policies`. Read those files for the current matrix; don't copy it here.

The parts the code doesn't make obvious:

- Org owners and admins can see every project. Without a project role they can read its content and manage its members and lifecycle, but not change its content. They can add themselves as PM.
- A project always keeps at least one PM. Leaving the org removes all project access.
- Without `github` read access, tickets and the project come back with their git data stripped. Clients never see it.
- A caller who isn't in the org, or has no access to the project, gets `NotFound`, not `Forbidden`.

**Who is signed in, before any request.** Whenever Better Auth sets or expires its session cookie, an after hook (`apps/backend/src/auth/viewerCookie.ts`) writes `pp-viewer` beside it: the signed-in user's id, readable by JavaScript, with the session cookie's path, `SameSite`, `Secure` and lifetime. That covers every sign-in (magic link, Google, Microsoft, GitHub, impersonation), session refreshes, sign-out and a session Better Auth finds expired; the app's own API expires it on any request that finds no session. The web app restores its on-disk snapshot only for the user that cookie names. It identifies, it never authorizes: the server ignores it.

**Enforcement.** The `Access` service in `server-core` resolves the caller's roles into an `OrgScope` or `ProjectScope`. Every org and project endpoint declares what it needs with a `RequiresOrg` or `RequiresProject` annotation in its `packages/shared/src/<domain>/*Api.ts` module; the `OrgAccess` / `ProjectAccess` middleware resolves the scope, checks it and hands it to the handler, failing with a tagged `Forbidden`. Tools declare the same requirement. Services read the scope from context, so a service can't run without one, and only data-dependent checks stay in the service.

**Where each piece lives.** Access is one model split by layer, the same way authentication splits contract from implementation:

| Layer | Holds |
| --- | --- |
| `packages/access` | The pure role model: statements, org and project roles, the effective role, and the data-dependent policies (`TicketPolicy`, `GroupPolicy`, ...). No HTTP. |
| `packages/shared/src/access` | The HTTP contract: the `OrgAccess` / `ProjectAccess` middleware tags, the `RequiresOrg` / `RequiresProject` annotations, the scope tags, `Actor`, and `canCall`. |
| `packages/server-core/src/access` | The `Access` service, which loads roles from Postgres and resolves scopes. |
| `apps/backend/src/access` | The live middleware layers that implement the contract tags. |
| `apps/frontend/src/hooks/useActor.ts` | `useProjectActor` and `useOrgActor`, which give components the viewer's actor. |

**The frontend asks the same sources.** `canCallProject` and `canCallOrg` from `@pp/shared` read each endpoint's requirement from `AppApi`, and data-dependent rules call the `@pp/access` policies. Anything the viewer can't do is hidden or read-only; the server still checks every request.

---

## Integrations

- **GitHub** — an organization owns any number of GitHub Apps, created from org settings through GitHub's app-manifest flow and stored encrypted (`organization_github_app`). Each App can be installed on several GitHub accounts, and org admins choose per installation which projects may use it. A project connects any number of repositories; the first is its default. A ticket lives in one repository (`repo` in its frontmatter): it links a branch and stacked PRs there, and status automation runs on PR events through webhooks. Pull request details from GitHub (title, state, checks) are cached in Postgres (`github_pull_request`), so reading git state never waits for GitHub; a once-a-minute cluster sweep syncs projects that are due and fills the gaps webhooks leave. A webhook is accepted only for installations of the App whose secret signed it. Ticket ownership, stack reconciliation and status automation stay in core. Startup reconciliation automatically fills missing `repo` values on legacy tickets before reconciling the index. Repository differences count as index drift even when ticket timestamps are unchanged. Disconnecting the current default repository, its installation or its App first preserves that identity on legacy tickets. See `docs/integrations/github-reference.md`.
- **Slack** — workspace per organization, channel notifications per project, ticket link previews. See `packages/integration-slack/README.md`.
- **Everhour** — per-user time tracking against tickets. See `packages/integration-everhour/README.md`.
- **Figma** — linked frames on tickets. See `docs/integrations/figma.md`.
- **Jira Cloud** — a durable, resumable migration of a Jira project into PP. The package owns the migration workflow and planning; backend adapters own writing PP data and the atomic commit that makes it visible. Each Jira issue type maps to one of the organization's ticket types (built in or the org's own; the new project has no types of its own yet) or to no type; a Jira type at epic level is suggested as Epic, others by name, and anything unrecognised as no type. Saving the setup refuses a type the organization doesn't have (`UnknownType`), and a mapping saved before custom types, with `other`, reads as no type. Jira epics, issues and subtasks keep their hierarchy as **Epics** and **Sub-tickets** wherever PP's nesting rules allow; links it cannot hold are reported as `parent-dropped` findings. Every imported ticket ends with an import note linking its Jira issue and keeping Jira-only facts (due date, resolution, unlinked assignee or reporter) as text; story points or original estimates become the ticket's estimate when ProjectProject can hold the value. The import report is rendered from one list of findings: everything left out, changed or kept only in `archive.json`. Each Jira account is linked to a member, left unlinked, or invited by email. The atomic commit issues those invitations with a project grant and records a `jira_identity_claim` per project and email; when that email accepts an invitation to the org, the claim assigns them their imported tickets, credits their reports and turns their Jira-attributed comments into theirs.
- **Project import** — an org member who can create projects uploads a project export to `POST /api/orgs/:org/project-imports`. The archive is unpacked as it streams in: attachment bytes go straight into the org's storage under an import prefix, and the manifest and markdown are staged on the `project_import` row. Running the import starts the durable `ProjectProject/ProjectImport/v1` workflow. Its activities rewrite the key (available old keys become former keys) and the people the importer linked, build the project hidden through the hidden-project host with the `project_import` attempt as its owner lock, index it, and publish it in one transaction. Ids for imported comments and activity are derived from the import attempt, so replayed steps write the same data, and a finalizer marks a failed attempt and removes its hidden project. Unlinked people become imported authors. Resolved custom ticket types are included as project-level markdown definitions; names or keys already present in the destination receive a numeric suffix, and tickets are rewritten to the resulting keys. The import review lists those names. Built-in type keys keep their identity, with source edits restored as project-level overrides. Failed, cancelled or abandoned imports are cleaned up after 30 days; active workflows are excluded from that sweep. Code in `packages/server-core/src/projects/ProjectImports.ts` and `importTransform.ts`.
- **References to fix** — PMs see unresolved references in imported ticket descriptions: people with no account here, ticket ids that navigation cannot resolve, and links to the source instance. The import workflow stores one candidate row per ticket and target in `project_import_reference` before publishing, and the publish transaction removes candidates that resolve. A list request for an earlier successful import can start a background backfill, which records completion on `project_import`. The service runs one backfill at a time, skips new scans while busy, and interrupts the active scan on shutdown. Later requests retry skipped scans. The list is empty until the backfill commits. Subsequent requests recheck stored targets and their ticket descriptions, pruning rows for references that disappeared or now resolve. Projects with no successful import skip ticket reads. Fixes go through the normal ticket update and remove the affected rows. Code in `packages/server-core/src/projects/ProjectReferences.ts` and `importReferences.ts`.
- **Hidden-project host** — `packages/server-core/src/projects/hiddenProject.ts` builds a project nobody can see yet (`project_index.published_at` is null), writes its markdown and pending attachments, verifies them, and publishes it in one transaction. Callers supply an owner lock that fences each step and marks the owner done inside the publish transaction. Its pending attachments keep source creation dates and are excluded from the ordinary attachment reaper; the owning workflow handles their cleanup. Indexing may advance the hidden project's ticket counter beyond its original plan. It holds no source-specific types, so any importer can use it.
- **Project export** — a PM or org admin downloads a project as one `.tar.gz`: `manifest.json` (Postgres rows, the people the project references, attachment metadata and the names of connected integrations, never credentials), the markdown folder under `project/` (including resolved custom type definitions), and attachment bytes under `attachments/`. Synced sections in ticket descriptions are resolved against the source library and saved as copies, so destination sections cannot replace their content. It is streamed from markdown and storage straight into the response and never stored. The format is `ProjectExportManifest` in `packages/shared/src/projects/ProjectExport.ts`.
- **Feedback** — instances send feedback and bug reports to a central instance. See `docs/deploy.md`.

Document writes persist provider-neutral events through the durable outbox; each integration consumes only its own subscribed deliveries. Don't add a universal integration-driver interface.

---

## Releases

`main` is built nightly; a soaked nightly is promoted to stable. Versions are build dates (Amsterdam time). `pp upgrade` installs only this project's own GitHub releases. Details in `docs/deploy.md`.
