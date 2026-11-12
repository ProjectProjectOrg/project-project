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
| Tests              | Vitest with `@effect/vitest`                                           |
| Delivery           | Docker images on ghcr.io, nightly and stable release channels          |

---

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
github:
  repoOwner: woutervh
  repoName: design-system
branchTemplate: "{type}/{id}-{slug}" # default: feat/T-12-add-button
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
blockedBy: [T-9] # can't start until T-9 is done; omitted when empty
relatedTo: [T-14] # omitted when empty
createdBy: github_42
createdAt: 2025-11-04T11:30:00Z
updatedAt: 2025-11-04T15:12:00Z
---

# Add primary button component

Description body in markdown. This is what Lexical reads/writes.
Code blocks, lists, tables, the works.
```

Ticket IDs are sequential per project.

**Moving a ticket to another project** in the same org gives it a new ID there; its sub-tickets move with it, and an epic that still has tickets can't be moved. A moved ticket keeps its type when the destination project has that type, and has no type otherwise. The file, its comments, attachments and activity move; the ticket leaves its sprint and epic, and keeps only the relations to tickets that move with it. The moved ticket lists every earlier location in its frontmatter, oldest first:

```yaml
movedFrom:
  - feedback/FB-12 # <project-slug>/<ticket-id>
```

The ticket index mirrors `movedFrom`, so an old URL redirects to the ticket and an old mention still resolves. Status, tags, assignees and the estimate are kept where the destination has them, and the branch link is kept when both projects use the same repository. Only a PM of the ticket's project can move it, into a project where they can create tickets.

A ticket mention is `mention:ticket/<id>` inside its own project and `mention:ticket/<project-slug>/<id>` across projects. A move rewrites the mentions in the moved ticket and the mentions of it in its old project.

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

A ticket's `type` is the key of a type its project has (built in, the org's or the project's own) or `null` for no type; the ticket index stores the same value, and the list filter value `none` selects tickets without a type. Ticket queries take types to include (`type`), types to leave out (`excludeType`), or both; views that hide epics exclude the `epic` type, so a ticket of any other type, defined or not, stays in them. Setting a type the project doesn't have, or one the project hides, fails with `Validation` (`unknown_type:<key>`); a ticket that already carries a hidden or removed type keeps it and can still be edited. A ticket created with a type and no description starts with that type's starting description (hints stripped) and its default priority and tags, unless those are passed. Changing the type replaces the description with the new type's starting description only while the description is empty or still an untouched starting description; clearing the type leaves the description alone. A custom type is never an epic. The frontend shows a type with the name, icon and colour of the definition in the ticket's own project library (`apps/frontend/src/features/tickets/lib/ticketTypes.ts`): a hidden type keeps its look but is not offered in menus, and a key that no longer resolves shows as the key.

Every place that creates a ticket (the inline creators in the backlog, sections, sprints and sub-tickets, and the create dialog) has one type picker and no template choice. It starts on the type the viewer last used to create a ticket in that project, kept per viewer and project in the browser's localStorage (`apps/frontend/src/features/tickets/hooks/useLastUsedType.ts`); a place that can't hold an epic starts on no type instead, and a remembered type the project no longer offers falls back to no type. A line under the creator names the sections the chosen type starts with. On a ticket, the type menu links people who may manage the library to that type's settings page, an empty description offers the project's types as starting points (choosing one sets the type), and an Add section button under the description lists the sections the type starts with but the ticket lacks, then every other section; the `/` menu offers the same two groups.

Older storage kept `templates/` folders and a default template per ticket type in `library.md` and `project.md`. The backend migrates both when it starts, before it accepts requests (`packages/server-core/src/library/LibraryMigration.ts`): a template that was the default for a type becomes that type's file in the same layer, every other template becomes a type of its own, and the `templates/` folders and the `templateDefaults` frontmatter are removed. It never overwrites an existing type file, so it is safe to run again. The same step rewrites ticket files that still say `type: other`, the old way to say no type, to `type: null`, changing nothing else in the file, logs the count per project and rebuilds that project's ticket index. A file not yet rewritten still reads as having no type.

### What lives in Postgres

- **Identity and access:** Better Auth's tables, plus project membership, roles and invite grants.
- **Indexes.** They mirror markdown so lists, filters and lookups don't parse every file, and they can be rebuilt from it. The project index also holds instance-local aesthetics such as banner images.
- **Project configuration that is instance-bound:** statuses, tags, git automation.
- **Integration state:** connections, OAuth state, encrypted credentials, links, and per-integration delivery records.
- **Durable work:** activity, outboxes and workflow engine state.

The tables themselves are in `packages/db/src/schema.ts`.

Adding a column for content a human writes is still a smell; it belongs in markdown.

---

## Surfaces

One set of services in `server-core` serves every surface. Handlers and tools stay thin.

- **Web app.** Cmd K composes the command registry with integration-owned commands derived from existing connection reads. Integration settings remain searchable; missing object storage and confirmed broken connections appear as setup suggestions, gated by the viewer's permissions. Organization, project and personal destinations keep their own scope. Cmd K also changes the preferred editor through the existing account mutation and links to personal connection setup and CLI/MCP instructions. The SPA calls `/api/*` through the client derived from `AppApi`, with a Better Auth session cookie. Sprint and backlog boards share keyboard navigation: Tab enters or leaves the board, arrows move among cards and column headers, F2 enters a card’s controls, and Escape returns to card navigation. Virtualized columns reveal a target before focus moves to it. The backlog retains the displayed view and grouping until the requested view’s query settles, so switching from the board to a cold list does not expose a loading placeholder. The router adapters in `apps/frontend/src/lib/searchParams.ts` delegate URL parsing and serialization to `URLSearchParams` and Effect `UrlParams`. Filters use repeated keys, while route-owned schemas in `features/tickets/lib/ticketSearch.ts` validate flat search state and convert it to the existing domain queries at the feature boundary. Router values stay strings or arrays of strings; default sorting is omitted from links. A ticket opened from a list or board carries its source in `from=sections` or `from=sprintBoard`, alongside that view's grouping, sprint and filters. Legacy JSON navigation context is discarded locally by the ticket search schema, so an old link can still open its ticket. Ticket links take their navigation context from the displayed result, including retained rows shown while a new filter request is pending. The ticket page asks the `neighbors` endpoint for the previous and next ticket in that view's order (section order, then the view's sort, or the sprint's manual order on a sprint board) and steps to them with the stepper or J and K.
- **MCP.** A Streamable HTTP endpoint on the backend, authenticated through Better Auth's OAuth provider so each client acts as the consenting user. It serves the tool catalog, defined in `packages/shared/src/tools`. Ticket discovery reuses the web app’s ranked text search across unarchived titles, descriptions and comments. Separate read tools expose complete comment discussions and cursor-paginated activity through the existing services and project permissions.
- **CLI.** `pp` calls the same tool catalog over an HTTP tool route, with its own OAuth client, token audience and DPoP-bound tokens. It picks a default org and project, and keeps itself in step with the server's release.

The editor and markdown read view use the same `remark-parse` CommonMark engine and shared `remark-gfm` plugin configuration in `features/editor/lib/markdownParser.ts`. Editor import maps its syntax tree to editable Lexical nodes, including nested lists, block quotes, tables and ordinary images. The existing transformer pipeline retains ticket blocks, mentions and integration embeds, keyboard shortcuts and markdown export; text, code spans and link/image destinations serialize through `mdast-util-to-markdown`. Unsupported editor constructs such as footnotes remain literal text and save without accumulating escapes.

Link previews cache favicon rendering metadata alongside the title and icon URL. The server fetches icons through the same public-host and redirect checks as page metadata, with a byte limit and bounded image decoding. Only transparent, nearly uniform neutral symbols are marked monochrome; the frontend makes those dark or light with the active theme. Colored, opaque, mixed-tone and unrecognized images retain their original colors. Existing cached previews acquire this metadata lazily without refetching the page.

Tagged errors map to the same taxonomy on every surface.

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

- **GitHub** — a GitHub App per organization. Repos connect per project; tickets link branches and stacked PRs, and status automation runs on PR events through webhooks. Ticket ownership, stack reconciliation and status automation stay in core.
- **Slack** — workspace per organization, channel notifications per project, ticket link previews. See `packages/integration-slack/README.md`.
- **Everhour** — per-user time tracking against tickets. See `packages/integration-everhour/README.md`.
- **Figma** — linked frames on tickets. See `docs/integrations/figma.md`.
- **Jira Cloud** — a durable, resumable migration of a Jira project into PP. The package owns the migration workflow and planning; backend adapters own writing PP data and the atomic commit that makes it visible. Jira epics, issues and subtasks keep their hierarchy as **Epics** and **Sub-tickets** wherever PP's nesting rules allow; links it cannot hold are reported as `parent-dropped` findings. Every imported ticket ends with an import note linking its Jira issue and keeping Jira-only facts (due date, resolution, unlinked assignee or reporter) as text; story points or original estimates become the ticket's estimate when ProjectProject can hold the value. The import report is rendered from one list of findings: everything left out, changed or kept only in `archive.json`. Each Jira account is linked to a member, left unlinked, or invited by email. The atomic commit issues those invitations with a project grant and records a `jira_identity_claim` per project and email; when that email accepts an invitation to the org, the claim assigns them their imported tickets, credits their reports and turns their Jira-attributed comments into theirs.
- **Feedback** — instances send feedback and bug reports to a central instance. See `docs/deploy.md`.

Document writes persist provider-neutral events through the durable outbox; each integration consumes only its own subscribed deliveries. Don't add a universal integration-driver interface.

---

## Releases

`main` is built nightly; a soaked nightly is promoted to stable. Versions are build dates (Amsterdam time). `pp upgrade` installs only this project's own GitHub releases. Details in `docs/deploy.md`.
