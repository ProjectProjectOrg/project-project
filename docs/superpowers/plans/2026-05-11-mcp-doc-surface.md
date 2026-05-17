# MCP Doc Surface Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three read-only MCP tools — `get_project_doc`, `get_group_doc`, `get_ticket_doc` — that return the raw markdown source (frontmatter + body) of each entity's on-disk `.md` file.

**Architecture:** Two-layer change matching Plan 2 conventions. The `Markdown` service (FS owner) gains three `read*FileRaw` primitives that return `{ path, content }` with `path` relative to the data root. The `ProjectDocs` / `GroupDocs` / `TicketDocs` services each gain a thin `readRaw` method delegating to Markdown. The MCP dispatcher gets three new handlers that perform the same membership-based visibility check the entity tools use, then call `*Docs.readRaw`.

**Tech Stack:** Effect, Effect Schema, `@effect/platform`'s `FileSystem` / `Path`, `bun:test` (dispatcher), `@effect/vitest` (`*Docs` service tests).

---

## File Map

**Created:**

- `packages/shared/src/mcp/DocFile.ts` — `DocFile = Struct({ path, content })`.

**Modified:**

- `packages/shared/src/mcp/index.ts` — re-export `DocFile`; append three catalog entries.
- `packages/backend/src/Services/Markdown.ts` — 3 new interface methods.
- `packages/backend/src/Layers/Markdown.ts` — 3 new impls.
- `packages/backend/src/Services/ProjectDocs.ts` / `GroupDocs.ts` / `TicketDocs.ts` — `readRaw` on each interface; export `RawFile` type alias re-using the Markdown shape.
- `packages/backend/src/Layers/ProjectDocs.ts` / `GroupDocs.ts` / `TicketDocs.ts` — `readRaw` impl + telemetry wrap.
- `packages/backend/src/mcp/handlers.ts` — three new handlers; `Env` union grows to include the `*Docs` services.
- `packages/backend/src/Services/DocumentDocs.test.ts` — three new `it.effect` cases for `readRaw`.
- `packages/backend/src/mcp/handlers.test.ts` — three new dispatcher smoke cases (or stub `*Docs` and exercise via existing test runtime).

---

## Task 1: Add `DocFile` shared schema and re-export

**Files:**
- Create: `packages/shared/src/mcp/DocFile.ts`
- Modify: `packages/shared/src/mcp/index.ts`

- [ ] **Step 1: Create the schema file**

`packages/shared/src/mcp/DocFile.ts`:

```ts
import * as Schema from "effect/Schema"

export const DocFile = Schema.Struct({
  path: Schema.String,
  content: Schema.String
})

export type DocFile = typeof DocFile.Type
```

- [ ] **Step 2: Re-export from the mcp barrel**

In `packages/shared/src/mcp/index.ts`, add to the existing `export *` block (alphabetical with the others):

```ts
export * from "./DocFile"
```

- [ ] **Step 3: Type-check the shared package**

Run: `bun run --filter @projectproject/shared typecheck` (or the project's equivalent — match the command the prior Plan 2 tasks used; check `package.json` scripts if unsure).
Expected: passes.

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/mcp/DocFile.ts packages/shared/src/mcp/index.ts
git commit -m "feat(shared/mcp): add DocFile schema for raw-doc tool outputs"
```

---

## Task 2: Add raw-read primitives to the `Markdown` service interface

**Files:**
- Modify: `packages/backend/src/Services/Markdown.ts`

- [ ] **Step 1: Add the three method signatures to `MarkdownShape`**

Insert next to the existing `readProjectFile` / `readTicketFile` / `readGroupFile` declarations (keep paired with each entity's other methods to match the file's existing grouping). The shared return shape is `{ path: string; content: string }`.

For projects (after `readProjectFile`):

```ts
readonly readProjectFileRaw: (
  orgSlug: string,
  slug: string
) => Effect.Effect<{ path: string; content: string }, NotFound | MarkdownError>
```

For tickets (after `readTicketParts`):

```ts
readonly readTicketFileRaw: (
  orgSlug: string,
  slug: string,
  id: string
) => Effect.Effect<{ path: string; content: string }, NotFound | MarkdownError>
```

For groups (after `readGroupFile`):

```ts
readonly readGroupFileRaw: (
  orgSlug: string,
  slug: string,
  id: string
) => Effect.Effect<{ path: string; content: string }, NotFound | MarkdownError>
```

- [ ] **Step 2: Type-check the backend (must fail because `MarkdownLive` doesn't satisfy the new shape yet)**

Run: `bun run --filter @projectproject/backend typecheck`
Expected: FAIL — `MarkdownLive` missing `readProjectFileRaw` / `readTicketFileRaw` / `readGroupFileRaw`. This confirms the interface change is wired.

- [ ] **Step 3: Do not commit yet** — combined with Task 3.

---

## Task 3: Implement the raw-read primitives in `MarkdownLive`

**Files:**
- Modify: `packages/backend/src/Layers/Markdown.ts`

The file already has `absoluteRoot`, `projectFilePath`, `ticketFilePath`, `groupFilePath` (or the equivalent inline `path.join` expressions), `ensureSafeOrgAndProject`, `ensureSafeId` (tickets), and `isSystemNotFound`. Reuse all of them — do not duplicate logic. Also note `import * as path from "node:path"` is already present (the file uses `path.join` and `path.dirname`); no new import needed.

- [ ] **Step 1: Implement `readProjectFileRaw`**

Insert directly after the existing `readProjectFile` const block in `MarkdownLive`:

```ts
const readProjectFileRaw = (
  orgSlug: string,
  slug: string
): Effect.Effect<{ path: string; content: string }, NotFound | MarkdownError> =>
  Effect.gen(function* () {
    yield* ensureSafeOrgAndProject(orgSlug, slug)
    const file = projectFilePath(orgSlug, slug)
    const content = yield* fs.readFileString(file, "utf8").pipe(
      Effect.mapError(
        (cause): NotFound | MarkdownError =>
          isSystemNotFound(cause)
            ? new NotFound()
            : new MarkdownError({ cause, message: `read failed: ${file}` })
      )
    )
    return { path: path.relative(absoluteRoot, file), content }
  })
```

- [ ] **Step 2: Implement `readTicketFileRaw`**

Insert directly after the existing `readTicketParts` const block:

```ts
const readTicketFileRaw = (
  orgSlug: string,
  slug: string,
  id: string
): Effect.Effect<{ path: string; content: string }, NotFound | MarkdownError> =>
  Effect.gen(function* () {
    yield* ensureSafeOrgAndProject(orgSlug, slug)
    yield* ensureSafeId(id)
    const file = ticketFilePath(orgSlug, slug, id)
    const content = yield* fs.readFileString(file, "utf8").pipe(
      Effect.mapError(
        (cause): NotFound | MarkdownError =>
          isSystemNotFound(cause)
            ? new NotFound()
            : new MarkdownError({ cause, message: `read failed: ${file}` })
      )
    )
    return { path: path.relative(absoluteRoot, file), content }
  })
```

- [ ] **Step 3: Implement `readGroupFileRaw`**

Insert directly after the existing `readGroupFile` const block. The groups area has its own id-safety check; mirror what `readGroupFile` itself does. If the file uses a `ensureSafeGroupId` helper, call it; if `readGroupFile` doesn't validate the id beyond `ensureSafeOrgAndProject`, don't add validation here either — stay symmetric with the sibling read:

```ts
const readGroupFileRaw = (
  orgSlug: string,
  slug: string,
  id: string
): Effect.Effect<{ path: string; content: string }, NotFound | MarkdownError> =>
  Effect.gen(function* () {
    yield* ensureSafeOrgAndProject(orgSlug, slug)
    // mirror whatever id-validation readGroupFile does — if it calls a helper, call it here too
    const file = groupFilePath(orgSlug, slug, id)
    const content = yield* fs.readFileString(file, "utf8").pipe(
      Effect.mapError(
        (cause): NotFound | MarkdownError =>
          isSystemNotFound(cause)
            ? new NotFound()
            : new MarkdownError({ cause, message: `read failed: ${file}` })
      )
    )
    return { path: path.relative(absoluteRoot, file), content }
  })
```

(If `groupFilePath` is an inline `path.join` in the existing code rather than a named helper, use the same `path.join(groupsDir(orgSlug, slug), \`${id}.md\`)` expression that `readGroupFile` uses.)

- [ ] **Step 4: Add the three new fields to the returned record**

The bottom of `MarkdownLive` returns an object literal listing every method (`return { projectDir, readProjectFile, ... } satisfies MarkdownShape`). Add `readProjectFileRaw`, `readTicketFileRaw`, `readGroupFileRaw` in the same order as the interface — next to their parsed-read siblings.

- [ ] **Step 5: Type-check the backend (must pass now)**

Run: `bun run --filter @projectproject/backend typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/backend/src/Services/Markdown.ts packages/backend/src/Layers/Markdown.ts
git commit -m "feat(backend/markdown): add raw-read primitives returning {path, content}"
```

---

## Task 4: Add `readRaw` to the three `*Docs` services (interface + impl + tests)

**Files:**
- Modify: `packages/backend/src/Services/ProjectDocs.ts`
- Modify: `packages/backend/src/Services/GroupDocs.ts`
- Modify: `packages/backend/src/Services/TicketDocs.ts`
- Modify: `packages/backend/src/Layers/ProjectDocs.ts`
- Modify: `packages/backend/src/Layers/GroupDocs.ts`
- Modify: `packages/backend/src/Layers/TicketDocs.ts`
- Modify: `packages/backend/src/Services/DocumentDocs.test.ts`

The three services share an identical shape for `readRaw`. Do them together, but make the test additions and the stub-extension to `makeMarkdown` first (TDD).

- [ ] **Step 1: Extend `makeMarkdown` in the test file with the three new method stubs**

In `packages/backend/src/Services/DocumentDocs.test.ts`, the `makeMarkdown(overrides)` helper builds a full `MarkdownShape` with `unexpectedMarkdownCall(...)` fallbacks. Add three more default entries so that any test that doesn't override them still satisfies the type:

```ts
readProjectFileRaw: () => unexpectedMarkdownCall("readProjectFileRaw"),
readTicketFileRaw: () => unexpectedMarkdownCall("readTicketFileRaw"),
readGroupFileRaw: () => unexpectedMarkdownCall("readGroupFileRaw"),
```

Place them next to their parsed-read siblings to match the file's existing grouping.

- [ ] **Step 2: Write the failing test for `ProjectDocs.readRaw`**

Append to `DocumentDocs.test.ts`:

```ts
it.effect(
  "ProjectDocs.readRaw returns the on-disk path and raw file contents",
  () =>
    Effect.gen(function* () {
      const docs = yield* ProjectDocs
      const file = yield* docs.readRaw("acme", "web")
      expect(file).toEqual({
        path: "orgs/acme/projects/web/project.md",
        content: "---\nslug: web\n---\n# Web\n"
      })
    }).pipe(
      Effect.provide(
        ProjectDocsLive.pipe(
          Layer.provide(
            makeMarkdown({
              readProjectFileRaw: (_org, _slug) =>
                Effect.succeed({
                  path: "orgs/acme/projects/web/project.md",
                  content: "---\nslug: web\n---\n# Web\n"
                })
            })
          )
        )
      )
    )
)
```

- [ ] **Step 3: Write the failing test for `TicketDocs.readRaw`**

```ts
it.effect(
  "TicketDocs.readRaw returns the on-disk path and raw file contents",
  () =>
    Effect.gen(function* () {
      const docs = yield* TicketDocs
      const file = yield* docs.readRaw("acme", "web", "T-12")
      expect(file).toEqual({
        path: "orgs/acme/projects/web/tickets/T-12.md",
        content: "---\nid: T-12\n---\n# Fix it\n"
      })
    }).pipe(
      Effect.provide(
        TicketDocsLive.pipe(
          Layer.provide(
            makeMarkdown({
              readTicketFileRaw: (_org, _slug, _id) =>
                Effect.succeed({
                  path: "orgs/acme/projects/web/tickets/T-12.md",
                  content: "---\nid: T-12\n---\n# Fix it\n"
                })
            })
          )
        )
      )
    )
)
```

- [ ] **Step 4: Write the failing test for `GroupDocs.readRaw`**

```ts
it.effect(
  "GroupDocs.readRaw returns the on-disk path and raw file contents",
  () =>
    Effect.gen(function* () {
      const docs = yield* GroupDocs
      const file = yield* docs.readRaw("acme", "web", "G-3")
      expect(file).toEqual({
        path: "orgs/acme/projects/web/groups/G-3.md",
        content: "---\nid: G-3\n---\n# Sprint 3\n"
      })
    }).pipe(
      Effect.provide(
        GroupDocsLive.pipe(
          Layer.provide(
            makeMarkdown({
              readGroupFileRaw: (_org, _slug, _id) =>
                Effect.succeed({
                  path: "orgs/acme/projects/web/groups/G-3.md",
                  content: "---\nid: G-3\n---\n# Sprint 3\n"
                })
            })
          )
        )
      )
    )
)
```

- [ ] **Step 5: Run the tests — expect failures from "`readRaw` not defined"**

Run: `bun run --filter @projectproject/backend test src/Services/DocumentDocs.test.ts`
Expected: 3 new tests FAIL because `readRaw` is missing from each service.

- [ ] **Step 6: Add `readRaw` to each `*Docs` service interface**

`packages/backend/src/Services/ProjectDocs.ts` — append to `ProjectDocsShape`:

```ts
readonly readRaw: (
  orgSlug: string,
  slug: string
) => Effect.Effect<{ path: string; content: string }, NotFound | MarkdownError>
```

`packages/backend/src/Services/GroupDocs.ts` — append to `GroupDocsShape`:

```ts
readonly readRaw: (
  orgSlug: string,
  slug: string,
  id: string
) => Effect.Effect<{ path: string; content: string }, NotFound | MarkdownError>
```

`packages/backend/src/Services/TicketDocs.ts` — append to `TicketDocsShape`:

```ts
readonly readRaw: (
  orgSlug: string,
  slug: string,
  id: string
) => Effect.Effect<{ path: string; content: string }, NotFound | MarkdownError>
```

- [ ] **Step 7: Implement `readRaw` in `ProjectDocsLive`**

In `packages/backend/src/Layers/ProjectDocs.ts`, inside the `Layer.effect` body, after the existing `read` const, add:

```ts
const readRaw = (
  orgSlug: string,
  slug: string
): Effect.Effect<{ path: string; content: string }, NotFound | MarkdownError> =>
  withProjectDocTelemetry(
    "readRaw",
    orgSlug,
    slug,
    markdown.readProjectFileRaw(orgSlug, slug)
  )
```

Add `readRaw` to the returned record (`return { read, write, removeDir, readRaw } satisfies ProjectDocsShape`).

- [ ] **Step 8: Implement `readRaw` in `GroupDocsLive`**

In `packages/backend/src/Layers/GroupDocs.ts`, after the existing `read` const:

```ts
const readRaw = (
  orgSlug: string,
  slug: string,
  id: string
): Effect.Effect<{ path: string; content: string }, NotFound | MarkdownError> =>
  withGroupDocTelemetry(
    "readRaw",
    orgSlug,
    slug,
    { groupId: id },
    markdown.readGroupFileRaw(orgSlug, slug, id)
  )
```

Add `readRaw` to the returned record next to the others.

- [ ] **Step 9: Implement `readRaw` in `TicketDocsLive`**

In `packages/backend/src/Layers/TicketDocs.ts`, after the existing `read` const:

```ts
const readRaw = (
  orgSlug: string,
  slug: string,
  id: string
): Effect.Effect<{ path: string; content: string }, NotFound | MarkdownError> =>
  withTicketDocTelemetry(
    "readRaw",
    orgSlug,
    slug,
    { ticketId: id },
    markdown.readTicketFileRaw(orgSlug, slug, id)
  )
```

Add `readRaw` to the returned record.

- [ ] **Step 10: Run the tests — expect PASS**

Run: `bun run --filter @projectproject/backend test src/Services/DocumentDocs.test.ts`
Expected: all three new tests PASS, plus the existing ones still pass.

- [ ] **Step 11: Commit**

```bash
git add packages/backend/src/Services/ProjectDocs.ts \
        packages/backend/src/Services/GroupDocs.ts \
        packages/backend/src/Services/TicketDocs.ts \
        packages/backend/src/Layers/ProjectDocs.ts \
        packages/backend/src/Layers/GroupDocs.ts \
        packages/backend/src/Layers/TicketDocs.ts \
        packages/backend/src/Services/DocumentDocs.test.ts
git commit -m "feat(backend/docs): add readRaw to ProjectDocs/GroupDocs/TicketDocs"
```

---

## Task 5: Add the three catalog entries

**Files:**
- Modify: `packages/shared/src/mcp/index.ts`

- [ ] **Step 1: Append the catalog entries**

In `packages/shared/src/mcp/index.ts`, the `McpTools` object already imports `Slug`, `GroupId`, `TicketId`. Add `DocFile` to the import block at the top:

```ts
import { DocFile } from "./DocFile"
```

Then append the three entries inside `McpTools` (after `get_git_state`):

```ts
get_project_doc: {
  description:
    "Raw markdown source of a project's project.md (frontmatter + body).",
  input: Schema.Struct({ orgSlug: Slug, projectSlug: Slug }),
  output: DocFile,
  errors: [Unauthorized, NotFound] as const
},
get_group_doc: {
  description:
    "Raw markdown source of a group's .md file (frontmatter + body).",
  input: Schema.Struct({
    orgSlug: Slug,
    projectSlug: Slug,
    id: GroupId
  }),
  output: DocFile,
  errors: [Unauthorized, NotFound] as const
},
get_ticket_doc: {
  description:
    "Raw markdown source of a ticket's .md file (frontmatter + body).",
  input: Schema.Struct({
    orgSlug: Slug,
    projectSlug: Slug,
    id: TicketId
  }),
  output: DocFile,
  errors: [Unauthorized, NotFound] as const
}
```

- [ ] **Step 2: Type-check shared (must pass) and backend (must FAIL — no handlers yet)**

Run: `bun run --filter @projectproject/shared typecheck`
Expected: PASS.

Run: `bun run --filter @projectproject/backend typecheck`
Expected: FAIL — `handlers` is missing entries for `get_project_doc` / `get_group_doc` / `get_ticket_doc` (the `HandlersMap<Env>` requires every catalog name).

- [ ] **Step 3: Do not commit yet** — combined with Task 6.

---

## Task 6: Implement the three MCP handlers

**Files:**
- Modify: `packages/backend/src/mcp/handlers.ts`

The visibility rule: a hidden project must return `NotFound` (identical to a missing file). `Projects.requireMember(orgSlug, userId, slug)` already does exactly this — it returns `NotFound` for non-members and for missing projects. Call it first, then call `*Docs.readRaw`.

- [ ] **Step 1: Add the imports**

At the top of `packages/backend/src/mcp/handlers.ts`, alongside the existing service imports:

```ts
import { ProjectDocs } from "../Services/ProjectDocs"
import { GroupDocs } from "../Services/GroupDocs"
import { TicketDocs } from "../Services/TicketDocs"
```

- [ ] **Step 2: Extend the `Env` union**

```ts
type Env =
  | CurrentUser
  | Users
  | BetterAuth
  | Projects
  | Tickets
  | Groups
  | Tags
  | ProjectDocs
  | GroupDocs
  | TicketDocs
```

- [ ] **Step 3: Implement `get_project_doc`**

Add next to `get_project`:

```ts
const get_project_doc = (input: { orgSlug: string; projectSlug: string }) =>
  Effect.gen(function* () {
    const current = yield* CurrentUser
    const projects = yield* Projects
    yield* projects.requireMember(input.orgSlug, current.id, input.projectSlug)
    const docs = yield* ProjectDocs
    return yield* docs.readRaw(input.orgSlug, input.projectSlug)
  })
```

- [ ] **Step 4: Implement `get_group_doc`**

Add next to `get_group`:

```ts
const get_group_doc = (input: {
  orgSlug: string
  projectSlug: string
  id: string
}) =>
  Effect.gen(function* () {
    const current = yield* CurrentUser
    const projects = yield* Projects
    yield* projects.requireMember(input.orgSlug, current.id, input.projectSlug)
    const docs = yield* GroupDocs
    return yield* docs.readRaw(input.orgSlug, input.projectSlug, input.id)
  })
```

- [ ] **Step 5: Implement `get_ticket_doc`**

Add next to `get_ticket`:

```ts
const get_ticket_doc = (input: {
  orgSlug: string
  projectSlug: string
  id: string
}) =>
  Effect.gen(function* () {
    const current = yield* CurrentUser
    const projects = yield* Projects
    yield* projects.requireMember(input.orgSlug, current.id, input.projectSlug)
    const docs = yield* TicketDocs
    return yield* docs.readRaw(input.orgSlug, input.projectSlug, input.id)
  })
```

- [ ] **Step 6: Register the new handlers**

Add to the `handlers` export object:

```ts
export const handlers: HandlersMap<Env> = {
  me,
  list_orgs,
  get_org,
  list_projects,
  get_project,
  list_groups,
  get_group,
  list_tickets,
  get_ticket,
  list_tags,
  list_members,
  get_git_state,
  get_project_doc,
  get_group_doc,
  get_ticket_doc
}
```

- [ ] **Step 7: Type-check backend (must PASS now)**

Run: `bun run --filter @projectproject/backend typecheck`
Expected: PASS.

- [ ] **Step 8: Confirm the runtime layer already provides `ProjectDocs` / `GroupDocs` / `TicketDocs`**

Check `packages/backend/src/runtime.ts` for `ProjectDocsLive`, `GroupDocsLive`, `TicketDocsLive` in the layer composition. They were added in Plan 1 / earlier — they should already be wired. If any is missing, add it next to its siblings. If all three are present, no change is needed in `runtime.ts`.

Run: `grep -n "ProjectDocsLive\|GroupDocsLive\|TicketDocsLive" packages/backend/src/runtime.ts`
Expected: all three appear at least once.

- [ ] **Step 9: Commit** (folds in Task 5 and Task 6 together since they're a single working unit)

```bash
git add packages/shared/src/mcp/index.ts packages/backend/src/mcp/handlers.ts
git commit -m "feat(mcp): expose get_project_doc / get_group_doc / get_ticket_doc"
```

---

## Task 7: Dispatcher smoke tests for the three new tools

**Files:**
- Modify: `packages/backend/src/mcp/handlers.test.ts`

The existing `handlers.test.ts` builds a fake MCP server, runs `registerAllTools`, and invokes a registered handler by name. Extend the `TestLayer` to provide stubs for the three `*Docs` services and `Projects.requireMember`, then exercise each new tool.

- [ ] **Step 1: Stub `Projects.requireMember` (success path) in the existing test runtime**

The current `EmptyStub(Projects)` returns an empty service that would fail on `requireMember`. Replace it with a real stub. Above the `TestLayer` block:

```ts
import { Projects, type ProjectsShape } from "../Services/Projects"
import { ProjectDocs, type ProjectDocsShape } from "../Services/ProjectDocs"
import { GroupDocs, type GroupDocsShape } from "../Services/GroupDocs"
import { TicketDocs, type TicketDocsShape } from "../Services/TicketDocs"

const ProjectsStub = Layer.succeed(Projects, {
  requireMember: (_o: any, _u: any, _s: any) =>
    Effect.succeed({ role: "admin" } as any)
} as unknown as ProjectsShape)

const ProjectDocsStub = Layer.succeed(ProjectDocs, {
  readRaw: (_o: any, _s: any) =>
    Effect.succeed({
      path: "orgs/acme/projects/demo/project.md",
      content: "---\nslug: demo\n---\n# Demo\n"
    })
} as unknown as ProjectDocsShape)

const GroupDocsStub = Layer.succeed(GroupDocs, {
  readRaw: (_o: any, _s: any, _id: any) =>
    Effect.succeed({
      path: "orgs/acme/projects/demo/groups/G-1.md",
      content: "---\nid: G-1\n---\n# Sprint 1\n"
    })
} as unknown as GroupDocsShape)

const TicketDocsStub = Layer.succeed(TicketDocs, {
  readRaw: (_o: any, _s: any, _id: any) =>
    Effect.succeed({
      path: "orgs/acme/projects/demo/tickets/T-1.md",
      content: "---\nid: T-1\n---\n# Fix it\n"
    })
} as unknown as TicketDocsShape)
```

- [ ] **Step 2: Replace the `Projects` empty-stub in `TestLayer` and add the three `*Docs` stubs**

```ts
const TestLayer = Layer.mergeAll(
  CurrentUserStub,
  TicketsStub,
  ProjectsStub,
  EmptyStub(Groups),
  EmptyStub(Tags),
  EmptyStub(Users),
  EmptyStub(BetterAuth),
  ProjectDocsStub,
  GroupDocsStub,
  TicketDocsStub
)
```

(Remove the prior `EmptyStub(Projects)` line.)

- [ ] **Step 3: Add a `describe` block with three smoke tests**

Append at the bottom of the file:

```ts
describe("MCP dispatcher → doc tools", () => {
  test("get_project_doc returns DocFile-shaped JSON envelope", async () => {
    const runtime = ManagedRuntime.make(TestLayer)
    const registered = new Map<
      string,
      (input: unknown) => Promise<{
        content: ReadonlyArray<{ type: "text"; text: string }>
        isError?: boolean
      }>
    >()
    const fakeServer = {
      registerTool: (
        name: string,
        _meta: unknown,
        cb: (input: unknown) => Promise<any>
      ) => {
        registered.set(name, cb)
      }
    } as any

    registerAllTools(fakeServer, runtime as any, handlers as any)

    const cb = registered.get("get_project_doc")
    expect(cb).toBeDefined()
    const result = await cb!({ orgSlug: "acme", projectSlug: "demo" })

    expect(result.isError).toBeUndefined()
    const payload = JSON.parse(result.content[0].text)
    expect(payload).toEqual({
      path: "orgs/acme/projects/demo/project.md",
      content: "---\nslug: demo\n---\n# Demo\n"
    })

    await runtime.dispose()
  })

  test("get_group_doc returns DocFile-shaped JSON envelope", async () => {
    const runtime = ManagedRuntime.make(TestLayer)
    const registered = new Map<string, (i: unknown) => Promise<any>>()
    const fakeServer = {
      registerTool: (name: string, _m: unknown, cb: any) => {
        registered.set(name, cb)
      }
    } as any
    registerAllTools(fakeServer, runtime as any, handlers as any)

    const cb = registered.get("get_group_doc")
    expect(cb).toBeDefined()
    const result = await cb!({
      orgSlug: "acme",
      projectSlug: "demo",
      id: "G-1"
    })

    expect(result.isError).toBeUndefined()
    const payload = JSON.parse(result.content[0].text)
    expect(payload.path).toBe("orgs/acme/projects/demo/groups/G-1.md")
    expect(payload.content).toContain("# Sprint 1")

    await runtime.dispose()
  })

  test("get_ticket_doc returns DocFile-shaped JSON envelope", async () => {
    const runtime = ManagedRuntime.make(TestLayer)
    const registered = new Map<string, (i: unknown) => Promise<any>>()
    const fakeServer = {
      registerTool: (name: string, _m: unknown, cb: any) => {
        registered.set(name, cb)
      }
    } as any
    registerAllTools(fakeServer, runtime as any, handlers as any)

    const cb = registered.get("get_ticket_doc")
    expect(cb).toBeDefined()
    const result = await cb!({
      orgSlug: "acme",
      projectSlug: "demo",
      id: "T-1"
    })

    expect(result.isError).toBeUndefined()
    const payload = JSON.parse(result.content[0].text)
    expect(payload.path).toBe("orgs/acme/projects/demo/tickets/T-1.md")
    expect(payload.content).toContain("# Fix it")

    await runtime.dispose()
  })
})
```

- [ ] **Step 4: Run the dispatcher tests**

Run: `bun run --filter @projectproject/backend test src/mcp/handlers.test.ts`
Expected: existing `list_tickets` test still PASSES; three new doc-tool tests PASS.

- [ ] **Step 5: Run the full backend test suite once for regression**

Run: `bun run --filter @projectproject/backend test`
Expected: green.

- [ ] **Step 6: Commit**

```bash
git add packages/backend/src/mcp/handlers.test.ts
git commit -m "test(backend/mcp): dispatcher smoke for get_*_doc tools"
```

---

## Task 8: NotFound visibility smoke test

**Files:**
- Modify: `packages/backend/src/mcp/handlers.test.ts`

Spec acceptance criterion: a hidden project must return `NotFound`, identical to a missing file. Cover it with one extra dispatcher test that swaps in a `Projects.requireMember` stub that fails with `NotFound`.

- [ ] **Step 1: Add a `NotFound` test for `get_ticket_doc` (pattern covers the other two by construction — same handler shape)**

Append to the existing `"MCP dispatcher → doc tools"` describe block:

```ts
test("get_ticket_doc returns NotFound when caller can't see the project", async () => {
  const HiddenProjectsStub = Layer.succeed(Projects, {
    requireMember: (_o: any, _u: any, _s: any) =>
      Effect.fail(new (require("@projectproject/shared").NotFound)())
  } as unknown as ProjectsShape)

  const HiddenLayer = Layer.mergeAll(
    CurrentUserStub,
    TicketsStub,
    HiddenProjectsStub,
    EmptyStub(Groups),
    EmptyStub(Tags),
    EmptyStub(Users),
    EmptyStub(BetterAuth),
    ProjectDocsStub,
    GroupDocsStub,
    TicketDocsStub
  )

  const runtime = ManagedRuntime.make(HiddenLayer)
  const registered = new Map<string, (i: unknown) => Promise<any>>()
  const fakeServer = {
    registerTool: (name: string, _m: unknown, cb: any) => {
      registered.set(name, cb)
    }
  } as any
  registerAllTools(fakeServer, runtime as any, handlers as any)

  const cb = registered.get("get_ticket_doc")
  const result = await cb!({
    orgSlug: "acme",
    projectSlug: "demo",
    id: "T-1"
  })

  expect(result.isError).toBe(true)
  expect(result.content[0].text.toLowerCase()).toContain("not found")

  await runtime.dispose()
})
```

The exact error-text assertion may need to be loosened to match what `mapToolError` actually emits for `NotFound`; if the assertion is brittle, replace the substring check with `expect(result.isError).toBe(true)` only — `isError` is the load-bearing assertion.

Replace the inline `require()` call with a top-of-file `import { NotFound } from "@projectproject/shared"` if `NotFound` isn't already imported in the test file.

- [ ] **Step 2: Run it**

Run: `bun run --filter @projectproject/backend test src/mcp/handlers.test.ts`
Expected: green, including the new test.

- [ ] **Step 3: Commit**

```bash
git add packages/backend/src/mcp/handlers.test.ts
git commit -m "test(backend/mcp): hidden-project NotFound case for get_ticket_doc"
```

---

## Task 9: End-to-end manual smoke (optional but recommended before merge)

- [ ] **Step 1: Start the backend** (whatever command the project uses — check `package.json` scripts; likely `bun run --filter @projectproject/backend dev` or `bun run dev` from the root).

- [ ] **Step 2: Seed at least one project, one group, one ticket** in `data/orgs/<org>/projects/<slug>/` if not already seeded.

- [ ] **Step 3: Inspect catalog** — hit the MCP endpoint (or use an MCP client) and confirm `get_project_doc`, `get_group_doc`, `get_ticket_doc` appear in the tool list with the correct input schemas.

- [ ] **Step 4: Call each tool** with valid inputs and confirm the returned text contains the YAML frontmatter delimiters (`---`) and the body.

No commit; this is a verification step. If anything is off, file the issue and fix before merge.

---

## Done when

- `bun run --filter @projectproject/backend typecheck` passes.
- `bun run --filter @projectproject/backend test` passes (including the four new dispatcher tests and three new `*Docs` tests).
- Catalog at `packages/shared/src/mcp/index.ts` lists 15 tools (was 12 after Plan 2; +3 here).
- Manual call to `get_ticket_doc` returns the raw markdown file content with frontmatter intact.
