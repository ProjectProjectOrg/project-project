# Effect MCP Server Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Serve `/mcp` through Effect's `McpServer` (MCP `2026-07-28` stateless, plus `2025-11-25` and `2025-06-18` for legacy clients), authenticate with Better Auth's verification primitives, add CIMD client registration, and refresh the connected-agents page.

**Architecture:** `McpServer.layerHttp` registers the `/mcp` POST route on the existing `HttpRouter`; a route-scoped `HttpRouter.middleware` verifies the bearer token with `verifyAccessTokenRequest` and sets a `Context.Reference` (`McpRequestUser`) that handlers read through `McpCurrentUser`. The shared `McpTools` catalog is mapped once into a `Toolkit`; `handlers.ts` supplies the toolkit handler layer. The `@modelcontextprotocol/sdk` server goes away; its client remains a dev dependency for the legacy-session test.

**Tech Stack:** Effect `4.0.0-rc.116` (`effect/unstable/ai`, `effect/unstable/http`), Bun, Better Auth 1.7.3 (`@better-auth/mcp`, `@better-auth/cimd`, `@better-auth/oauth-provider`, `better-auth/oauth2`), vite-plus test, Ajv (tests only), TanStack Start frontend with paraglide messages.

**Spec:** `docs/superpowers/specs/2026-09-19-effect-mcp-server-migration-design.md`

## Global Constraints

- Effect packages pinned to exactly `4.0.0-rc.116`: `effect`, `@effect/platform-bun`, `@effect/sql-pg`, `@effect/atom-react`, `@effect/vitest`.
- Better Auth packages pinned to exactly `1.7.3`: `better-auth`, `@better-auth/mcp`, `@better-auth/cimd`, `@better-auth/oauth-provider`.
- Protocol list, in this order: `McpProtocol.v2026_07_28`, `McpProtocol.v2025_11_25`, `McpProtocol.v2025_06_18`.
- `@modelcontextprotocol/sdk` may only be imported from `*.test.ts` files.
- No comments in source files (AGENTS.md). Test files follow the same rule.
- Agent-facing `isError` texts come from `mapToolError` in `packages/backend/src/mcp/errorMap.ts`, unchanged.
- Frontend strings go through paraglide `m.*`; new ids use the `profile_connect_mcp_` prefix in `packages/frontend/messages/en/account.json`, sorted alphabetically inside the prefix group.
- Formatting and linting: `vp fmt` and `vp lint`, never `npx prettier`.
- DB-backed tests need `PROJECTPROJECT_TEST_DATABASE_URL` pointing at a local database whose name starts with `projectproject_effect_v4_`. Run them with `vp test run --project backend <file> --no-file-parallelism`.
- Commands run from the repo root `/Users/luukmunneke/Personal/project-project` unless stated.
- Work happens on branch `chore/effect-mcp-server-migration`.

---

## File Structure

| Path | Responsibility |
| --- | --- |
| `packages/backend/src/mcp/McpRequestUser.ts` (create) | `McpRequestUser` reference and `McpCurrentUser` accessor |
| `packages/backend/src/mcp/toolkit.ts` (create) | Maps `McpTools` into `Tool`s, builds `McpToolkit`, `toolFailure`, `toToolkitHandlers` |
| `packages/backend/src/mcp/handlers.ts` (modify) | Domain handlers reading `McpCurrentUser`; exports `handlers` and `McpToolkitHandlersLive` |
| `packages/backend/src/mcp/dispatch.ts` (delete) | Replaced by Effect's server core |
| `packages/backend/src/mcp/currentUserStorage.ts` (delete) | Replaced by `McpRequestUser` |
| `packages/backend/src/Layers/McpAuth.ts` (create) | Route-scoped auth middleware on Better Auth primitives |
| `packages/backend/src/Layers/Mcp.ts` (create) | `McpServer.layerHttp` + toolkit + middleware |
| `packages/backend/src/Layers/McpHttp.ts`, `McpServer.ts`, `Services/McpHttp.ts`, `Services/McpServer.ts` (delete) | Old SDK bridge |
| `packages/backend/src/Layers/Mcp.test.ts` (create, replaces `McpHttp.test.ts`) | Modern, legacy and conformance integration tests |
| `packages/backend/src/auth/cimdTransport.ts` (create) | Indirection for the CIMD metadata fetch transport |
| `packages/backend/src/auth.ts` (modify) | Compose `cimd()` |
| `packages/backend/src/main.ts` (modify) | Mount `McpLive`, drop the bridge |
| `packages/frontend/src/components/ConnectedAgentsSection.tsx` (modify) | Four platforms with verified snippets |
| `packages/frontend/messages/en/account.json` (modify) | New/changed `profile_connect_mcp_*` strings |

---

### Task 1: Bump Effect to rc116

**Files:**
- Modify: `package.json`, `packages/backend/package.json`, `packages/frontend/package.json`, `packages/shared/package.json`, `bun.lock`

**Interfaces:**
- Produces: a workspace on `effect@4.0.0-rc.116` where `vp run typecheck` and `vp test run` pass, so every later task compiles against the API used in this plan.

- [ ] **Step 1: Replace the pins**

```bash
grep -rl '4.0.0-rc.112' package.json packages/*/package.json | xargs sed -i '' 's/4.0.0-rc.112/4.0.0-rc.116/g'
grep -rn 'rc.11' package.json packages/*/package.json
```

Expected: every `effect` and `@effect/*` line shows `4.0.0-rc.116`; no `rc.112` remains.

- [ ] **Step 2: Install**

Run: `bun install`
Expected: exits 0, `bun.lock` updated.

- [ ] **Step 3: Typecheck**

Run: `vp run typecheck`
Expected: PASS. If rc113–rc116 renamed or removed APIs, fix each error at its call site with the rc116 equivalent. Do not touch MCP files beyond what is needed to compile; they are rewritten in later tasks.

- [ ] **Step 4: Run the non-DB test suite**

Run: `vp test run`
Expected: PASS (DB tests skip without `PROJECTPROJECT_TEST_DATABASE_URL`).

- [ ] **Step 5: Run the DB suite if a test database is available**

Run: `PROJECTPROJECT_TEST_DATABASE_URL=<local url> vp run test:db`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore(effect): bump to 4.0.0-rc.116"
```

---

### Task 2: Dependency reshuffle

**Files:**
- Modify: `packages/backend/package.json`, `bun.lock`

**Interfaces:**
- Produces: `@better-auth/cimd`, `@better-auth/oauth-provider` importable from backend source; `@modelcontextprotocol/sdk` and `ajv` available only to tests.

- [ ] **Step 1: Edit `packages/backend/package.json`**

In `dependencies`: remove `"@modelcontextprotocol/sdk": "^1.29.0"`; add
```json
"@better-auth/cimd": "1.7.3",
"@better-auth/oauth-provider": "1.7.3",
```
In `devDependencies`: add
```json
"@modelcontextprotocol/sdk": "^1.30.0",
"ajv": "^8.20.0",
```

- [ ] **Step 2: Install and verify resolution**

```bash
bun install
cd packages/backend && bun -e 'import("@better-auth/cimd").then(m => console.log(typeof m.cimd)); import("@better-auth/oauth-provider").then(m => console.log(typeof m.createResourceServerChallenge))'
```
Expected: prints `function` twice.

- [ ] **Step 3: Commit**

```bash
git add packages/backend/package.json bun.lock
git commit -m "chore(backend): add CIMD and oauth-provider, make MCP SDK test-only"
```

---

### Task 3: `McpRequestUser` and `McpCurrentUser`

**Files:**
- Create: `packages/backend/src/mcp/McpRequestUser.ts`
- Test: `packages/backend/src/mcp/McpRequestUser.test.ts`

**Interfaces:**
- Produces:
  - `McpRequestUser: Context.Reference<Option.Option<User>>` (default `Option.none()`)
  - `McpCurrentUser: Effect.Effect<User, Unauthorized>`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, test } from "vite-plus/test"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Option from "effect/Option"
import type { User } from "@projectproject/shared"
import { McpCurrentUser, McpRequestUser } from "./McpRequestUser"

const user = { id: "u-1" } as User

describe("McpCurrentUser", () => {
  test("fails Unauthorized when no user was set for the request", async () => {
    const exit = await Effect.runPromiseExit(McpCurrentUser)
    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isFailure(exit)) {
      expect(String(exit.cause)).toContain("Unauthorized")
    }
  })

  test("returns the user set on the request", async () => {
    const result = await Effect.runPromise(
      McpCurrentUser.pipe(
        Effect.provideService(McpRequestUser, Option.some(user))
      )
    )
    expect(result.id).toBe("u-1")
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `vp test run --project backend packages/backend/src/mcp/McpRequestUser.test.ts`
Expected: FAIL, module `./McpRequestUser` not found.

- [ ] **Step 3: Implement**

```ts
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import { Unauthorized, type User } from "@projectproject/shared"

export const McpRequestUser = Context.Reference<Option.Option<User>>(
  "@projectproject/backend/mcp/McpRequestUser",
  { defaultValue: () => Option.none() }
)

export const McpCurrentUser: Effect.Effect<User, Unauthorized> = Effect.flatMap(
  McpRequestUser,
  Option.match({
    onNone: () => Effect.fail(new Unauthorized()),
    onSome: Effect.succeed
  })
)
```

- [ ] **Step 4: Run to verify it passes**

Run: `vp test run --project backend packages/backend/src/mcp/McpRequestUser.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/mcp/McpRequestUser.ts packages/backend/src/mcp/McpRequestUser.test.ts
git commit -m "feat(mcp): request-scoped user reference for tool handlers"
```

---

### Task 4: Fiber propagation spike (decides middleware vs handler-side auth)

**Files:**
- Test: `packages/backend/src/Layers/McpPropagation.test.ts`

**Interfaces:**
- Consumes: `McpRequestUser` from Task 3.
- Produces: a permanent test proving that a value set by a route-scoped `HttpRouter.middleware` is visible inside an `McpServer` tool handler. If this test cannot be made to pass, stop and apply the fallback described in Step 5 before continuing to Task 7.

- [ ] **Step 1: Write the test**

```ts
import { describe, expect, test } from "vite-plus/test"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import { HttpRouter } from "effect/unstable/http"
import { McpProtocol, McpServer, Tool, Toolkit } from "effect/unstable/ai"
import type { User } from "@projectproject/shared"
import { McpRequestUser } from "../mcp/McpRequestUser"

const WhoAmI = Tool.make("who_am_i", {
  success: Schema.Struct({ id: Schema.String })
})
const toolkit = Toolkit.make(WhoAmI)

const Handlers = toolkit.toLayer({
  who_am_i: () =>
    Effect.map(McpRequestUser, (user) => ({
      id: Option.match(user, { onNone: () => "nobody", onSome: (u) => u.id })
    }))
})

const SetUser = HttpRouter.middleware((effect) =>
  Effect.provideService(effect, McpRequestUser, Option.some({ id: "u-42" } as User))
).layer

const Mcp = McpServer.layerHttp({
  name: "spike",
  version: "0",
  path: "/mcp",
  protocols: [McpProtocol.v2026_07_28]
}).pipe(
  Layer.provideMerge(McpServer.toolkit(toolkit)),
  Layer.provide(Handlers),
  Layer.provide(SetUser)
)

const meta = {
  "io.modelcontextprotocol/protocolVersion": "2026-07-28",
  "io.modelcontextprotocol/clientInfo": { name: "spike", version: "0" },
  "io.modelcontextprotocol/clientCapabilities": {}
}

describe("middleware value reaches tool handlers", () => {
  test("who_am_i sees the user set by the route middleware", async () => {
    const { handler, dispose } = HttpRouter.toWebHandler(Mcp, { disableLogger: true })
    const response = await handler(
      new Request("http://localhost/mcp", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
          "mcp-protocol-version": "2026-07-28",
          "mcp-method": "tools/call",
          "mcp-name": "who_am_i"
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: { name: "who_am_i", arguments: {}, _meta: meta }
        })
      })
    )
    const body = await response.json()
    await dispose()
    expect(response.status).toBe(200)
    expect(body.result.isError).toBeUndefined()
    expect(body.result.content[0].text).toContain("u-42")
  })
})
```

- [ ] **Step 2: Run**

Run: `vp test run --project backend packages/backend/src/Layers/McpPropagation.test.ts`
Expected: PASS. Text contains `u-42`.

- [ ] **Step 3: If the text says `nobody`, inspect**

Add a second tool that yields `HttpServerRequest.HttpServerRequest` from `effect/unstable/http` and returns its `headers["x-probe"]`; send the request with that header. If the header arrives but the reference does not, Effect keeps `HttpServerRequest` in handler context but drops other fiber services.

- [ ] **Step 4: Decide**

If Step 2 passed: continue with Task 7 as written (middleware sets `McpRequestUser`).

- [ ] **Step 5: Fallback if Step 2 failed and Step 3 showed the header arrives**

Change `McpCurrentUser` in Task 3 so it reads `HttpServerRequest.HttpServerRequest`, calls `McpAuth.resolveUser(headers)` (Task 7 then exports `McpAuth` as a `Context.Service` with `resolveUser: (headers: Headers.Headers) => Effect<User, Unauthorized>`) and caches the result per request in a `WeakMap<HttpServerRequest, Promise<User>>`. The middleware in Task 7 keeps only the 401 challenge role. Update the spec's "Spike" section with the outcome. All later tasks stay the same.

- [ ] **Step 6: Commit**

```bash
git add packages/backend/src/Layers/McpPropagation.test.ts
git commit -m "test(mcp): prove route middleware context reaches tool handlers"
```

---

### Task 5: `mcp/toolkit.ts`, catalog to `Tool` definitions

**Files:**
- Create: `packages/backend/src/mcp/toolkit.ts`
- Test: `packages/backend/src/mcp/toolkit.test.ts`

**Interfaces:**
- Consumes: `McpTools`, `McpToolName` from `@projectproject/shared`; `mapToolError` from `./errorMap`.
- Produces:
  - `McpToolkit: Toolkit.Toolkit<McpToolsByName>` with one tool per catalog key, `failure: Schema.String`, `failureMode: "return"`.
  - `type McpHandlers<R>` = `{ [K in McpToolName]: (input: InputOf<K>) => Effect<OutputOf<K>, unknown, R> }` (moved from `dispatch.ts`, error widened to `unknown`).
  - `toolFailure: <A, R>(effect: Effect<A, unknown, R>) => Effect<A, string, R>`.
  - `toToolkitHandlers: <R>(handlers: McpHandlers<R>) => Toolkit.HandlersFrom<McpToolsByName>`.

- [ ] **Step 1: Capture today's input schemas as fixtures before touching anything**

```bash
cd packages/backend && bun -e '
import * as Schema from "effect/Schema"
import { McpTools } from "@projectproject/shared"
const out = {}
for (const [name, spec] of Object.entries(McpTools)) {
  const doc = Schema.toJsonSchemaDocument(spec.input)
  out[name] = { ...doc.schema, type: "object", $defs: doc.definitions }
}
await Bun.write("src/mcp/__fixtures__/legacyInputSchemas.json", JSON.stringify(out, null, 2))
'
ls -la packages/backend/src/mcp/__fixtures__/legacyInputSchemas.json
```
Expected: file exists with 28 top-level keys.

- [ ] **Step 2: Write the failing test**

```ts
import { describe, expect, test } from "vite-plus/test"
import Ajv from "ajv"
import * as Effect from "effect/Effect"
import { Tool } from "effect/unstable/ai"
import { McpTools, NotFound, Validation } from "@projectproject/shared"
import legacy from "./__fixtures__/legacyInputSchemas.json"
import { McpToolkit, toolFailure } from "./toolkit"

const fixtures: Record<string, ReadonlyArray<unknown>> = {
  me: [{}, [], { extra: 1 }],
  create_ticket: [
    { orgSlug: "acme", projectSlug: "demo", title: "Valid ticket" },
    { orgSlug: "acme", projectSlug: "demo", title: "" },
    { orgSlug: "acme", projectSlug: "demo" },
    []
  ],
  list_tickets: [
    { orgSlug: "acme", projectSlug: "demo" },
    { orgSlug: "acme", projectSlug: "demo", limit: 10 },
    { orgSlug: "acme" }
  ],
  get_org: [{ orgSlug: "acme" }, {}]
}

describe("McpToolkit", () => {
  test("exposes exactly the catalog's tool names", () => {
    expect(Object.keys(McpToolkit.tools).sort()).toEqual(
      Object.keys(McpTools).sort()
    )
  })

  test("input schemas accept and reject the same inputs as before", () => {
    const ajv = new Ajv({ strict: false, allErrors: true })
    for (const [name, inputs] of Object.entries(fixtures)) {
      const before = ajv.compile(legacy[name as keyof typeof legacy])
      const after = ajv.compile(Tool.getJsonSchema(McpToolkit.tools[name as keyof typeof McpToolkit.tools]))
      for (const input of inputs) {
        expect(after(input), `${name} ${JSON.stringify(input)}`).toBe(before(input))
      }
    }
  })

  test("toolFailure maps catalog errors to errorMap text", async () => {
    expect(await Effect.runPromise(Effect.flip(toolFailure(Effect.fail(new NotFound()))))).toBe("Not found.")
    expect(
      await Effect.runPromise(
        Effect.flip(toolFailure(Effect.fail(new Validation({ reason: "title required" }))))
      )
    ).toBe("Validation error (title required).")
    expect(await Effect.runPromise(Effect.flip(toolFailure(Effect.die("boom"))))).toBe("Internal error.")
  })
})
```

Adjust `Validation`'s constructor arguments to match `packages/shared/src/errors.ts` if its fields differ from `{ reason }`.

- [ ] **Step 3: Run to verify it fails**

Run: `vp test run --project backend packages/backend/src/mcp/toolkit.test.ts`
Expected: FAIL, `./toolkit` not found.

- [ ] **Step 4: Implement**

```ts
import * as Effect from "effect/Effect"
import * as Record from "effect/Record"
import * as Schema from "effect/Schema"
import { Tool, Toolkit } from "effect/unstable/ai"
import { McpTools, type McpToolName } from "@projectproject/shared"
import { mapToolError } from "./errorMap"

type SpecOf<K extends McpToolName> = (typeof McpTools)[K]
type InputOf<K extends McpToolName> = Schema.Schema.Type<SpecOf<K>["input"]>
type OutputOf<K extends McpToolName> = Schema.Schema.Type<SpecOf<K>["output"]>

export type McpHandlers<R> = {
  readonly [K in McpToolName]: (input: InputOf<K>) => Effect.Effect<OutputOf<K>, unknown, R>
}

type McpToolFor<K extends McpToolName> = K extends McpToolName
  ? Tool.Tool<
      K,
      {
        readonly parameters: SpecOf<K>["input"]
        readonly success: SpecOf<K>["output"]
        readonly failure: typeof Schema.String
        readonly failureMode: "return"
      }
    >
  : never

export type McpToolsByName = { readonly [K in McpToolName]: McpToolFor<K> }

const makeTool = <K extends McpToolName>(name: K): McpToolFor<K> => {
  const spec = McpTools[name] as SpecOf<K>
  return Tool.make(name, {
    description: spec.description,
    parameters: spec.input,
    success: spec.output,
    failure: Schema.String,
    failureMode: "return"
  }) as McpToolFor<K>
}

const toolNames = Object.keys(McpTools) as ReadonlyArray<McpToolName>

export const McpToolkit = Toolkit.make(
  ...toolNames.map((name) => makeTool(name))
) as Toolkit.Toolkit<McpToolsByName>

const failureText = (e: unknown) => mapToolError(e).content[0].text

export const toolFailure = <A, R>(
  effect: Effect.Effect<A, unknown, R>
): Effect.Effect<A, string, R> =>
  effect.pipe(
    Effect.tapDefect((cause) => Effect.logError("mcp tool defect", cause)),
    Effect.catchDefect((defect) => Effect.fail(defect)),
    Effect.mapError(failureText)
  )

export const toToolkitHandlers = <R>(
  handlers: McpHandlers<R>
): Toolkit.HandlersFrom<McpToolsByName> =>
  Record.map(handlers, (handler, name) => (input: unknown) =>
    toolFailure(
      (handler as (i: unknown) => Effect.Effect<unknown, unknown, R>)(input)
    ).pipe(Effect.withSpan(`mcp.tool.${name}`))
  ) as unknown as Toolkit.HandlersFrom<McpToolsByName>
```

`Effect.catchDefect` followed by `mapError` is what routes defects through `mapToolError`, which returns `"Internal error."` for non-tagged values.

- [ ] **Step 5: Run to verify it passes**

Run: `vp test run --project backend packages/backend/src/mcp/toolkit.test.ts`
Expected: PASS (3 tests). If the schema-equivalence test fails for a specific fixture, inspect both schemas with `console.log(JSON.stringify(...))`; a difference in `$defs` placement is fine, a difference in accepted inputs is a bug in the mapping and must be fixed.

- [ ] **Step 6: Typecheck**

Run: `cd packages/backend && bun run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/backend/src/mcp/toolkit.ts packages/backend/src/mcp/toolkit.test.ts packages/backend/src/mcp/__fixtures__/legacyInputSchemas.json
git commit -m "feat(mcp): derive Effect Tool definitions from the shared catalog"
```

---

### Task 6: `handlers.ts` becomes the toolkit handler layer

**Files:**
- Modify: `packages/backend/src/mcp/handlers.ts`
- Modify: `packages/backend/src/mcp/handlers.test.ts`, `packages/backend/src/mcp/attachments.test.ts`, `packages/backend/src/mcp/orgStorage.test.ts`
- Delete: `packages/backend/src/mcp/dispatch.ts`, `packages/backend/src/mcp/currentUserStorage.ts`

**Interfaces:**
- Consumes: `McpCurrentUser`, `McpRequestUser` (Task 3); `McpHandlers`, `McpToolkit`, `toToolkitHandlers`, `toolFailure` (Task 5).
- Produces:
  - `handlers: McpHandlers<Env>` (same keys as today).
  - `McpToolkitHandlersLive: Layer.Layer<Tool.HandlersFor<McpToolsByName>, never, Env>`.

- [ ] **Step 1: Rewrite the test harness in `handlers.test.ts`**

Replace the imports of `CallToolRequestSchema`, `currentUserStorage`, `registerAllTools` and the `captureToolCalls` helper with:

```ts
import * as Option from "effect/Option"
import { McpRequestUser } from "./McpRequestUser"
import { toolFailure } from "./toolkit"
import { handlers } from "./handlers"

type ToolResult = {
  content: ReadonlyArray<{ type: "text"; text: string }>
  isError?: boolean
}

const fakeUser = { id: "u-1" } as User

const callTool = <K extends McpToolName>(
  layer: Layer.Layer<any>,
  name: K,
  input: unknown
): Promise<ToolResult> =>
  Schema.decodeUnknownEffect(McpTools[name].input)(input).pipe(
    Effect.flatMap((decoded) =>
      (handlers[name] as (i: unknown) => Effect.Effect<unknown, unknown, any>)(decoded)
    ),
    Effect.flatMap((value) => Schema.encodeUnknownEffect(McpTools[name].output)(value)),
    Effect.map(
      (value): ToolResult => ({
        content: [{ type: "text", text: JSON.stringify(value, null, 2) }]
      })
    ),
    toolFailure,
    Effect.catch((text) =>
      Effect.succeed<ToolResult>({ isError: true, content: [{ type: "text", text }] })
    ),
    Effect.provideService(McpRequestUser, Option.some(fakeUser)),
    Effect.provide(layer),
    Effect.runPromise
  )
```

Add `type McpToolName` to the `@projectproject/shared` import. Then, in every test body, replace the `ManagedRuntime.make` / `registerAllTools` / `registered.get(...)` / `withFakeUser(...)` sequence with a single `await callTool(TestLayer, "<tool name>", { ...input })`, and delete the `await runtime.dispose()` lines. The assertions on `result.isError` and `result.content[0].text` stay as they are. Remove the now-unused `ManagedRuntime` import.

- [ ] **Step 2: Update `attachments.test.ts` and `orgStorage.test.ts`**

Replace every `Layer.succeed(CurrentUser, user)` with `Layer.succeed(McpRequestUser, Option.some(user))` and every `Effect.provideService(CurrentUser, user)` with `Effect.provideService(McpRequestUser, Option.some(user))`. Add `import * as Option from "effect/Option"` and `import { McpRequestUser } from "./McpRequestUser"`; drop `CurrentUser` from the shared import if it is no longer used.

- [ ] **Step 3: Run the three test files to verify they fail**

Run: `vp test run --project backend packages/backend/src/mcp/handlers.test.ts packages/backend/src/mcp/attachments.test.ts packages/backend/src/mcp/orgStorage.test.ts`
Expected: FAIL. Handlers still yield `CurrentUser`, which the tests no longer provide.

- [ ] **Step 4: Rewrite `handlers.ts` header and footer**

Replace the imports of `CurrentUser` (shared) and `HandlersMap` (`./dispatch`) with:

```ts
import { McpCurrentUser } from "./McpRequestUser"
import { McpToolkit, toToolkitHandlers, type McpHandlers } from "./toolkit"
```

Replace every `const current = yield* CurrentUser` with `const current = yield* McpCurrentUser` (29 occurrences; `grep -c "yield\* CurrentUser" packages/backend/src/mcp/handlers.ts` must return 0 afterwards). Delete the comment block above `type Env`. Change the export at the bottom to:

```ts
export const handlers: McpHandlers<Env> = {
  me: (i) => dieInternal(me(i)),
  list_orgs: (i) => dieInternal(list_orgs(i)),
  get_org: (i) => dieInternal(get_org(i)),
  list_projects: (i) => dieInternal(list_projects(i)),
  get_project: (i) => dieInternal(get_project(i)),
  list_groups: (i) => dieInternal(list_groups(i)),
  list_sprints: (i) => dieInternal(list_sprints(i)),
  get_group: (i) => dieInternal(get_group(i)),
  list_tickets: (i) => dieInternal(list_tickets(i)),
  get_ticket: (i) => dieInternal(get_ticket(i)),
  list_statuses: (i) => dieInternal(list_statuses(i)),
  list_tags: (i) => dieInternal(list_tags(i)),
  list_members: (i) => dieInternal(list_members(i)),
  get_git_state: (i) => dieInternal(get_git_state(i)),
  get_project_doc: (i) => dieInternal(get_project_doc(i)),
  get_group_doc: (i) => dieInternal(get_group_doc(i)),
  get_ticket_doc: (i) => dieInternal(get_ticket_doc(i)),
  create_ticket: (i) => dieInternal(create_ticket(i)),
  update_ticket: (i) => dieInternal(update_ticket(i)),
  prepare_ticket_attachment: (i) => dieInternal(prepare_ticket_attachment(i)),
  create_comment: (i) => dieInternal(create_comment(i)),
  attach_branch: (i) => dieInternal(attach_branch(i)),
  rebuild_ticket_index: (i) => dieInternal(rebuild_ticket_index(i)),
  add_tickets_to_group: (i) => dieInternal(add_tickets_to_group(i)),
  create_sprint: (i) => dieInternal(create_sprint(i)),
  update_sprint: (i) => dieInternal(update_sprint(i)),
  complete_sprint: (i) => dieInternal(complete_sprint(i))
}

export const McpToolkitHandlersLive = McpToolkit.toLayer(toToolkitHandlers(handlers))
```

- [ ] **Step 5: Delete the old dispatcher**

```bash
git rm packages/backend/src/mcp/dispatch.ts packages/backend/src/mcp/currentUserStorage.ts
```

`Layers/McpServer.ts` still imports `registerAllTools`; it is deleted in Task 8. Until then, typecheck will fail on that file only. Confirm with `cd packages/backend && bun run typecheck 2>&1 | grep -v "Layers/McpServer.ts\|Layers/McpHttp.ts"` showing no other errors.

- [ ] **Step 6: Run the three test files to verify they pass**

Run: `vp test run --project backend packages/backend/src/mcp/handlers.test.ts packages/backend/src/mcp/attachments.test.ts packages/backend/src/mcp/orgStorage.test.ts`
Expected: PASS, same test count as before.

- [ ] **Step 7: Commit**

```bash
git add -A packages/backend/src/mcp
git commit -m "refactor(mcp): handlers read the request user and feed the Effect toolkit"
```

---

### Task 7: `Layers/McpAuth.ts`, bearer verification middleware

**Files:**
- Create: `packages/backend/src/Layers/McpAuth.ts`

**Interfaces:**
- Consumes: `auth`, `mcpResource` from `../auth`; `Db` from `../Services/Db`; `Users` from `../Services/Users`; `oauthConsent` from `../db/auth-schema`; `McpRequestUser` (Task 3).
- Produces: `McpAuthMiddlewareLive: Layer.Layer<HttpRouter.Request.From<"Requires", never> | ..., never, Db | Users>` — the `.layer` of an `HttpRouter.middleware`. Provide it to the MCP route layer with `Layer.provide`.

- [ ] **Step 1: Implement**

```ts
import { and, eq, inArray } from "drizzle-orm"
import { createResourceServerChallenge } from "@better-auth/oauth-provider"
import {
  createDpopReplayStore,
  verifyAccessTokenRequest
} from "better-auth/oauth2"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import {
  HttpRouter,
  HttpServerRequest,
  HttpServerResponse
} from "effect/unstable/http"
import { auth, mcpResource } from "../auth"
import { oauthConsent } from "../db/auth-schema"
import { McpRequestUser } from "../mcp/McpRequestUser"
import { Db } from "../Services/Db"
import { Users } from "../Services/Users"

class TokenRejected extends Data.TaggedError("TokenRejected")<{
  readonly cause: unknown
}> {}

const ConsentIds = Schema.Array(Schema.String)

const challenge = (cause: unknown) => {
  const apiError = createResourceServerChallenge(cause, mcpResource)
  if (!apiError) return Effect.die(cause)
  const headers = Object.fromEntries(new Headers(apiError.headers as HeadersInit).entries())
  return Effect.succeed(
    HttpServerResponse.jsonUnsafe(
      {
        jsonrpc: "2.0",
        error: { code: -32000, message: apiError.message },
        id: null
      },
      { status: apiError.statusCode, headers }
    )
  )
}

export const McpAuthMiddlewareLive = HttpRouter.middleware(
  Effect.gen(function* () {
    const db = yield* Db
    const users = yield* Users
    const { baseURL, internalAdapter } = yield* Effect.promise(() => auth.$context)
    if (!baseURL) return yield* Effect.die("BETTER_AUTH_URL is required for MCP auth")
    const replayStore = createDpopReplayStore(internalAdapter)

    const verify = (request: HttpServerRequest.HttpServerRequest) =>
      Effect.tryPromise({
        try: () =>
          verifyAccessTokenRequest(
            {
              authorizationHeader: request.headers["authorization"],
              dpopProofJwt: request.headers["dpop"],
              method: request.method,
              url: mcpResource
            },
            {
              verifyOptions: { issuer: baseURL, audience: mcpResource },
              jwksUrl: `${baseURL}/jwks`,
              dpop: { replayStore }
            }
          ),
        catch: (cause) => new TokenRejected({ cause })
      })

    const resolveUser = (claims: Record<string, unknown>) =>
      Effect.gen(function* () {
        const userId = claims.sub
        const clientId = claims.client_id
        const consentIds = claims.pp_consent_ids
        if (
          typeof userId !== "string" ||
          typeof clientId !== "string" ||
          !Schema.is(ConsentIds)(consentIds) ||
          consentIds.length === 0
        ) {
          return Option.none()
        }
        const consents = yield* db
          .select({ id: oauthConsent.id })
          .from(oauthConsent)
          .where(
            and(
              eq(oauthConsent.userId, userId),
              eq(oauthConsent.clientId, clientId),
              inArray(oauthConsent.id, consentIds)
            )
          )
          .limit(1)
          .pipe(Effect.orDie)
        if (consents.length === 0) return Option.none()
        const found = yield* users.fullByIds([userId]).pipe(Effect.orDie)
        return Option.fromNullable(found[0])
      })

    return (effect) =>
      Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest
        const claims = yield* verify(request)
        const user = yield* resolveUser(claims as Record<string, unknown>)
        if (Option.isNone(user)) {
          return yield* new TokenRejected({ cause: new Error("consent revoked") })
        }
        return yield* Effect.provideService(effect, McpRequestUser, user)
      }).pipe(Effect.catchTag("TokenRejected", (e) => challenge(e.cause)))
  })
).layer
```

If `createResourceServerChallenge` returns `undefined` for the synthetic "consent revoked" error, replace that branch with a direct 401: `HttpServerResponse.jsonUnsafe({ jsonrpc: "2.0", error: { code: -32000, message: "Unauthorized" }, id: null }, { status: 401, headers: { "www-authenticate": \`Bearer resource_metadata="${new URL("/.well-known/oauth-protected-resource/mcp", mcpResource).href}"\` } })`. The DB-backed test in Task 9 asserts the header is present either way.

- [ ] **Step 2: Typecheck this file**

Run: `cd packages/backend && bun run typecheck 2>&1 | grep McpAuth`
Expected: no output. Fix type errors here before moving on (the two old SDK layers may still error; ignore those).

- [ ] **Step 3: Commit**

```bash
git add packages/backend/src/Layers/McpAuth.ts
git commit -m "feat(mcp): verify bearer tokens in an Effect middleware on Better Auth primitives"
```

---

### Task 8: `Layers/Mcp.ts` and wiring in `main.ts`

**Files:**
- Create: `packages/backend/src/Layers/Mcp.ts`
- Modify: `packages/backend/src/main.ts`
- Delete: `packages/backend/src/Layers/McpHttp.ts`, `packages/backend/src/Layers/McpServer.ts`, `packages/backend/src/Services/McpHttp.ts`, `packages/backend/src/Services/McpServer.ts`, `packages/backend/src/Layers/McpHttp.test.ts`

**Interfaces:**
- Consumes: `McpToolkit`, `McpToolkitHandlersLive` (Tasks 5–6); `McpAuthMiddlewareLive` (Task 7).
- Produces: `McpLive: Layer.Layer<never, Cause.IllegalArgumentError, HttpRouter.HttpRouter | Env | Db | Users>` — a route layer to merge into `RouteLive`.

- [ ] **Step 1: Create `Layers/Mcp.ts`**

```ts
import * as Layer from "effect/Layer"
import { McpProtocol, McpServer } from "effect/unstable/ai"
import { McpToolkitHandlersLive } from "../mcp/handlers"
import { McpToolkit } from "../mcp/toolkit"
import { McpAuthMiddlewareLive } from "./McpAuth"

export const McpLive = McpServer.layerHttp({
  name: "projectproject",
  version: "0.1.0",
  path: "/mcp",
  protocols: [
    McpProtocol.v2026_07_28,
    McpProtocol.v2025_11_25,
    McpProtocol.v2025_06_18
  ],
  instructions:
    "Access the user's organizations, projects, groups, and tickets. Create and update tickets, comments, and sprints. Upload ticket attachments using prepare_ticket_attachment, then POST the file bytes to its uploadUrl from your file environment. The upload response contains committed attachment metadata; use update_ticket to place the permanent URL in the description."
}).pipe(
  Layer.provideMerge(McpServer.toolkit(McpToolkit)),
  Layer.provide(McpToolkitHandlersLive),
  Layer.provide(McpAuthMiddlewareLive),
  Layer.orDie
)
```

- [ ] **Step 2: Rewire `main.ts`**

Remove the imports of `McpHttp`, `McpHttpLive`, `McpServerLive`. Add `import { McpLive } from "./Layers/Mcp"`. Delete the `mcpRoute` definition and its comment block (the block starting `// /mcp is mounted as an HttpRouter.all route`). In `RouteLive`, replace `HttpRouter.add("*", "/mcp", mcpRoute),` with `McpLive,`. In `ServerLive`, delete the two lines `Layer.provide(McpHttpLive),` and `Layer.provide(McpServerLive),`.

- [ ] **Step 3: Delete the old files**

```bash
git rm packages/backend/src/Layers/McpHttp.ts packages/backend/src/Layers/McpServer.ts packages/backend/src/Services/McpHttp.ts packages/backend/src/Services/McpServer.ts packages/backend/src/Layers/McpHttp.test.ts
grep -rn "McpHttp\|Services/McpServer\|currentUserStorage\|mcp/dispatch\|@modelcontextprotocol/sdk" packages/backend/src --include='*.ts' | grep -v "\.test\.ts"
```
Expected: no output from the grep. `oauthCompatibility.test.ts` imports `McpHttp`; that is fixed in Task 10.

- [ ] **Step 4: Typecheck and lint**

Run: `vp run typecheck && vp lint`
Expected: PASS. If `ServerLive` now reports a missing `Db` or `Users` requirement, they are already in `BackendInfrastructureLive` / `BackendHttpServicesLive`; check the layer order rather than adding new provides.

- [ ] **Step 5: Boot smoke test**

```bash
cd packages/backend && timeout 20 bun --env-file=../../.env src/main.ts & sleep 8
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/mcp -H "content-type: application/json" -H "accept: application/json, text/event-stream" -d '{}'
kill %1
```
Expected: `401` (no bearer). The `www-authenticate` header can be seen with `-D -`.

- [ ] **Step 6: Commit**

```bash
git add -A packages/backend/src
git commit -m "feat(mcp): serve /mcp through Effect McpServer with 2026-07-28 and legacy adapters"
```

---

### Task 9: Integration tests for modern, legacy and conformance paths

**Files:**
- Create: `packages/backend/src/Layers/Mcp.test.ts`
- Modify: `package.json` (`test:db` script)

**Interfaces:**
- Consumes: `McpLive` (Task 8); `BackendServicesLive`, `BackendInfrastructureLive` from `../runtime`.
- Produces: two web handlers built with `HttpRouter.toWebHandler(McpLive.pipe(Layer.provide(services)))`, driven round-robin.

- [ ] **Step 1: Write the test file**

Copy the `beforeAll`/`afterAll` blocks from the deleted `McpHttp.test.ts` (recover with `git show HEAD~1:packages/backend/src/Layers/McpHttp.test.ts`): same DB guard, migrations, temp dir, env stubs, `oauth_client`, `organization`, users, consents and signed JWTs. Replace the runtime construction with:

```ts
const { McpLive } = await import("./Mcp")
const { BackendServicesLive, BackendInfrastructureLive } = await import("../runtime")
const app = McpLive.pipe(
  Layer.provide(BackendServicesLive.pipe(Layer.provideMerge(BackendInfrastructureLive)))
)
const built = [
  HttpRouter.toWebHandler(app, { disableLogger: true }),
  HttpRouter.toWebHandler(app, { disableLogger: true })
]
handlers = built.map((b) => b.handler)
dispose = async () => { await Promise.all(built.map((b) => b.dispose())) }
```

Add these helpers above the `describe`:

```ts
const meta = {
  "io.modelcontextprotocol/protocolVersion": "2026-07-28",
  "io.modelcontextprotocol/clientInfo": { name: "modern-test", version: "1" },
  "io.modelcontextprotocol/clientCapabilities": {}
}

let requestCount = 0
const nextHandler = () => handlers[requestCount++ % handlers.length]

const modern = async (
  token: string | undefined,
  method: string,
  params: Record<string, unknown> = {},
  overrides: { headers?: Record<string, string>; meta?: Record<string, unknown> } = {}
) => {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
    "mcp-protocol-version": "2026-07-28",
    "mcp-method": method,
    ...(token ? { authorization: `Bearer ${token}` } : {}),
    ...(typeof params.name === "string" ? { "mcp-name": params.name } : {}),
    ...overrides.headers
  }
  const response = await nextHandler()(
    new Request(resource, {
      method: "POST",
      headers,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: ++requestCount,
        method,
        params: { ...params, _meta: overrides.meta ?? meta }
      })
    })
  )
  expect(response.headers.get("mcp-session-id")).toBeNull()
  const text = await response.text()
  const body = response.headers.get("content-type")?.includes("text/event-stream")
    ? JSON.parse(
        text.split("\n").filter((l) => l.startsWith("data:")).at(-1)!.slice(5)
      )
    : text ? JSON.parse(text) : undefined
  return { status: response.status, headers: response.headers, body }
}

const callTool = (token: string, name: string, args: Record<string, unknown> = {}) =>
  modern(token, "tools/call", { name, arguments: args })
```

Then the tests:

```ts
it("modern: discover lists all served revisions", async () => {
  const { status, body } = await modern(tokens[0], "server/discover")
  expect(status).toBe(200)
  expect(body.result.supportedVersions).toEqual(["2026-07-28", "2025-11-25", "2025-06-18"])
})

it("modern: lists the catalog tools with object input schemas", async () => {
  const { body } = await modern(tokens[0], "tools/list")
  const names = body.result.tools.map((t: { name: string }) => t.name).sort()
  expect(names).toEqual(Object.keys(McpTools).sort())
  for (const tool of body.result.tools) expect(tool.inputSchema.type).toBe("object")
})

it("modern: isolates users across round-robin handlers", async () => {
  await Promise.all(
    Array.from({ length: 6 }, async (_, i) => {
      const userIndex = i % tokens.length
      const { body } = await callTool(tokens[userIndex], "me")
      expect(body.result.isError).toBeUndefined()
      expect(body.result.content[0].text).toContain(userIds[userIndex])
    })
  )
})

it("modern: validation and not-found errors are isError text", async () => {
  const invalid = await callTool(tokens[0], "create_ticket", { orgSlug: "acme", projectSlug: "demo", title: "" })
  expect(invalid.body.result.isError).toBe(true)
  expect(invalid.body.result.content[0].text).toContain("Validation error")
  const missing = await callTool(tokens[0], "get_org", { orgSlug: orgId })
  expect(missing.body.result.isError).toBe(true)
})

it("modern: unknown tool is JSON-RPC -32602", async () => {
  const { body } = await callTool(tokens[0], "not_a_tool")
  expect(body.error.code).toBe(-32602)
})

it("modern: unsupported protocol version is 400 with -32022 and the supported list", async () => {
  const { status, body } = await modern(tokens[0], "tools/list", {}, {
    headers: { "mcp-protocol-version": "1900-01-01" },
    meta: { ...meta, "io.modelcontextprotocol/protocolVersion": "1900-01-01" }
  })
  expect(status).toBe(400)
  expect(body.error.code).toBe(-32022)
  expect(body.error.data.supported).toContain("2026-07-28")
})

it("modern: Mcp-Name mismatch is 400 with -32020", async () => {
  const { status, body } = await modern(
    tokens[0],
    "tools/call",
    { name: "me", arguments: {} },
    { headers: { "mcp-name": "other" } }
  )
  expect(status).toBe(400)
  expect(body.error.code).toBe(-32020)
})

it("modern: missing MCP-Protocol-Version header is 400", async () => {
  const { status } = await modern(tokens[0], "tools/list", {}, { headers: { "mcp-protocol-version": "" } })
  expect(status).toBe(400)
})

it("auth: unauthenticated and expired requests get a 401 challenge", async () => {
  const anonymous = await modern(undefined, "tools/list")
  expect(anonymous.status).toBe(401)
  expect(anonymous.headers.get("www-authenticate")).toContain("Bearer")
  expect(anonymous.headers.get("www-authenticate")).toContain("resource_metadata")
  const expired = await modern(expiredToken, "tools/list")
  expect(expired.status).toBe(401)
})

it("auth: GET and DELETE are 405", async () => {
  for (const method of ["GET", "DELETE"]) {
    const response = await handlers[0](
      new Request(resource, { method, headers: { authorization: `Bearer ${tokens[0]}` } })
    )
    expect(response.status).toBe(405)
    expect(response.headers.get("allow")).toBe("POST")
  }
})

it("legacy: SDK client negotiates 2025-11-25 with a session and can call tools", async () => {
  const client = new Client({ name: "legacy-test", version: "1" })
  clients.push(client)
  let sessionSeen = false
  const transport = new StreamableHTTPClientTransport(new URL(resource), {
    requestInit: { headers: { authorization: `Bearer ${tokens[1]}` } },
    fetch: async (input, init) => {
      const response = await handlers[0](new Request(input.toString(), init))
      if (response.headers.get("mcp-session-id")) sessionSeen = true
      return response
    }
  })
  await client.connect(transport)
  expect(sessionSeen).toBe(true)
  expect(transport.sessionId).toBeDefined()
  const result = await client.callTool({ name: "me", arguments: {} })
  expect(result).toMatchObject({
    content: [{ type: "text", text: expect.stringContaining(userIds[1]) }]
  })
})

it("auth: revoking consent locks the token out", async () => {
  await pool.query("DELETE FROM oauth_provider_consent WHERE id=$1", [consentIds[0]])
  const { status } = await modern(tokens[0], "tools/list")
  expect(status).toBe(401)
  const other = await callTool(tokens[1], "me")
  expect(other.body.result.content[0].text).toContain(userIds[1])
})
```

Imports needed at the top: `HttpRouter` from `effect/unstable/http`, `Client` from `@modelcontextprotocol/sdk/client/index.js`, `StreamableHTTPClientTransport` from `@modelcontextprotocol/sdk/client/streamableHttp.js`, `McpTools` from `@projectproject/shared`. Keep the legacy test pinned to `handlers[0]` only: sessions are per instance.

- [ ] **Step 2: Update the root `test:db` script**

In `package.json`, replace `packages/backend/src/Layers/McpHttp.test.ts` with `packages/backend/src/Layers/Mcp.test.ts`.

- [ ] **Step 3: Run**

Run: `PROJECTPROJECT_TEST_DATABASE_URL=<local url> vp test run --project backend packages/backend/src/Layers/Mcp.test.ts --no-file-parallelism`
Expected: PASS, 12 tests. Common failures and what they mean:
- `-32020` on every modern call: the `mcp-name` header is being sent for non-`tools/call` methods; the helper only adds it when `params.name` is a string, check the spread.
- 400 on the legacy `initialize`: the SDK sends `mcp-protocol-version: 2025-11-25` only after negotiation; that is expected and handled by Effect. If it persists, print the response body.
- `challenge` dying: see the note in Task 7 Step 1 and use the direct 401.

- [ ] **Step 4: Commit**

```bash
git add packages/backend/src/Layers/Mcp.test.ts package.json
git commit -m "test(mcp): cover modern stateless, legacy session and protocol conformance paths"
```

---

### Task 10: CIMD client registration

**Files:**
- Create: `packages/backend/src/auth/cimdTransport.ts`
- Modify: `packages/backend/src/auth.ts`
- Modify: `packages/backend/src/db/oauthCompatibility.test.ts`

**Interfaces:**
- Consumes: `cimd` from `@better-auth/cimd`; `fetchClientMetadataResource` from `@better-auth/cimd/node`.
- Produces: `auth` advertising `client_id_metadata_document_supported: true`; `fetchClientMetadataResource` re-exported from `./auth/cimdTransport` so tests can mock it.

- [ ] **Step 1: Bun compatibility check of the Node transport**

```bash
cd packages/backend && bun -e '
const { fetchClientMetadataResource } = await import("@better-auth/cimd/node")
try {
  const r = await fetchClientMetadataResource("https://modelcontextprotocol.io/", { method: "GET" })
  console.log("status", r.status)
} catch (e) { console.log("error", e?.constructor?.name, e?.message) }
'
```
Expected: `status 200`, or a `TypeError` with a message from the transport itself (for example about redirects or content). A `Bun`-specific error such as "not implemented" or a stack inside `node:https` means the transport does not run on Bun; in that case write `packages/backend/src/auth/cimdTransport.ts` as a Bun implementation with the same guarantees: resolve the hostname once with `Bun.dns.lookup`, reject non-public addresses using `isPublicRoutableHost` from `@better-auth/core/utils/host`, pin the address by connecting to it while setting `Host` and TLS `servername` to the original hostname, refuse redirects (`redirect: "manual"`, throw on 3xx), and cap the body at 5 KB. Otherwise the file is a two-line re-export.

- [ ] **Step 2: Create `auth/cimdTransport.ts`**

```ts
export { fetchClientMetadataResource } from "@better-auth/cimd/node"
```

- [ ] **Step 3: Compose the plugin in `auth.ts`**

Add imports:
```ts
import { cimd } from "@better-auth/cimd"
import { fetchClientMetadataResource } from "./auth/cimdTransport"
```
In the `plugins` array, directly after the `mcp({ ... })` entry, add:
```ts
cimd({
  fetchClientMetadataResource,
  metadataProfile: "mcp-2026-07-28"
}),
```

- [ ] **Step 4: Add tests to `oauthCompatibility.test.ts`**

Replace the `McpHttp` import and `handleMcp` setup with the `McpLive` + `HttpRouter.toWebHandler` construction used in Task 9 (the existing test at line ~219 calls `handleMcp`; keep that variable name and assign it the web handler). Then add:

```ts
it("advertises Client ID Metadata Document support", async () => {
  const response = await fetch(`${baseUrl}/.well-known/oauth-authorization-server`)
  const metadata = await response.json()
  expect(metadata.client_id_metadata_document_supported).toBe(true)
})

it("accepts an HTTPS metadata URL as client_id", async () => {
  const clientIdUrl = "https://agent.example/oauth/client.json"
  const { fetchClientMetadataResource } = await import("../auth/cimdTransport")
  vi.mocked(fetchClientMetadataResource).mockImplementation(async () =>
    new Response(
      JSON.stringify({
        client_id: clientIdUrl,
        client_name: "CIMD test agent",
        redirect_uris: ["http://127.0.0.1:15999/callback"],
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        token_endpoint_auth_method: "none"
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    )
  )
  const verifier = randomUUID()
  const challenge = createHash("sha256").update(verifier).digest("base64url")
  const authorize = new URL(`${baseUrl}/api/auth/mcp/authorize`)
  authorize.searchParams.set("client_id", clientIdUrl)
  authorize.searchParams.set("redirect_uri", "http://127.0.0.1:15999/callback")
  authorize.searchParams.set("response_type", "code")
  authorize.searchParams.set("scope", "openid")
  authorize.searchParams.set("code_challenge", challenge)
  authorize.searchParams.set("code_challenge_method", "S256")
  authorize.searchParams.set("resource", `${baseUrl}/mcp`)
  const response = await fetch(authorize, { headers: { cookie }, redirect: "manual" })
  expect([200, 302]).toContain(response.status)
  const location = response.headers.get("location") ?? ""
  expect(location).not.toContain("error=")
  const stored = await pool.query("SELECT name FROM oauth_client WHERE client_id=$1", [clientIdUrl])
  expect(stored.rows[0]?.name).toBe("CIMD test agent")
})
```

At the top of the file add `vi.mock("../auth/cimdTransport", () => ({ fetchClientMetadataResource: vi.fn() }))`. Reuse `cookie` from the existing sign-in setup in this file. If the consent page redirect carries the query differently, follow how the existing "discovers, registers, and reauthorizes" test reads the authorize response and mirror it.

- [ ] **Step 5: Run**

Run: `PROJECTPROJECT_TEST_DATABASE_URL=<local url> vp test run --project backend packages/backend/src/db/oauthCompatibility.test.ts --no-file-parallelism`
Expected: PASS, existing 3 tests plus 2 new.

- [ ] **Step 6: Typecheck, lint, commit**

```bash
vp run typecheck && vp lint
git add packages/backend/src/auth.ts packages/backend/src/auth/cimdTransport.ts packages/backend/src/db/oauthCompatibility.test.ts
git commit -m "feat(auth): register MCP clients through Client ID Metadata Documents"
```

---

### Task 11: Connected-agents page

**Files:**
- Modify: `packages/frontend/src/components/ConnectedAgentsSection.tsx`
- Modify: `packages/frontend/messages/en/account.json`

**Interfaces:**
- Consumes: existing `ProviderItem`, `CodeSnippet`, `m.*`.
- Produces: four providers, each with a `revision` note.

- [ ] **Step 1: Update messages in `account.json`**

Replace the `profile_connect_mcp_*` block with (keep alphabetical order inside the prefix):

```json
"profile_connect_mcp_caveat": "Replace the URL with your own deployment if it differs. Clients on MCP 2026-07-28 connect without server-side sessions; older clients keep a session on the instance they first reached.",
"profile_connect_mcp_claude_description": "Run this once, then start the sign-in with /mcp inside Claude Code or with claude mcp login projectproject.",
"profile_connect_mcp_claude_label": "Claude Code",
"profile_connect_mcp_codex_description": "Run this once, then run codex mcp login projectproject to connect your account.",
"profile_connect_mcp_codex_label": "Codex CLI",
"profile_connect_mcp_cursor_description": "Add this to .cursor/mcp.json (project) or ~/.cursor/mcp.json (global), then click the sign-in prompt Cursor shows for the server.",
"profile_connect_mcp_cursor_label": "Cursor",
"profile_connect_mcp_gemini_description": "Run this once. The CLI opens the sign-in on the first request.",
"profile_connect_mcp_gemini_label": "Gemini CLI",
"profile_connect_mcp_revision": "Speaks MCP {revision}",
"profile_connect_mcp_title": "Connect a new agent",
```

- [ ] **Step 2: Update the providers list**

In `ConnectMcpDisclosure`, replace the `providers` array and the `McpProvider` type:

```ts
type McpProvider = {
  readonly id: string
  readonly label: string
  readonly description: string
  readonly revision: string
  readonly language: "bash" | "json"
  readonly buildSnippet: (mcpUrl: string) => string
}
```

```ts
[
  {
    id: "claude",
    label: m.profile_connect_mcp_claude_label(),
    description: m.profile_connect_mcp_claude_description(),
    revision: "2026-07-28",
    language: "bash",
    buildSnippet: (url) => `claude mcp add --transport http projectproject ${url}`
  },
  {
    id: "codex",
    label: m.profile_connect_mcp_codex_label(),
    description: m.profile_connect_mcp_codex_description(),
    revision: "2026-07-28",
    language: "bash",
    buildSnippet: (url) => `codex mcp add projectproject --url ${url}`
  },
  {
    id: "cursor",
    label: m.profile_connect_mcp_cursor_label(),
    description: m.profile_connect_mcp_cursor_description(),
    revision: "2025-11-25",
    language: "json",
    buildSnippet: (url) =>
      JSON.stringify({ mcpServers: { projectproject: { url } } }, null, 2)
  },
  {
    id: "gemini",
    label: m.profile_connect_mcp_gemini_label(),
    description: m.profile_connect_mcp_gemini_description(),
    revision: "2025-06-18",
    language: "bash",
    buildSnippet: (url) => `gemini mcp add --transport http projectproject ${url}`
  }
]
```

In `ProviderItem`, render the revision under the description:

```tsx
<p className="text-xs text-muted-foreground">{provider.description}</p>
<p className="text-[11px] text-muted-foreground/80">
  {m.profile_connect_mcp_revision({ revision: provider.revision })}
</p>
<CodeSnippet code={snippet} language={provider.language} />
```

Delete the comment block at the top of the file (AGENTS.md forbids it) while you are there.

- [ ] **Step 3: Regenerate paraglide and typecheck**

Run: `cd packages/frontend && bun run typecheck`
Expected: PASS. If `m.profile_connect_mcp_cursor_label` is missing, the paraglide compile step did not run; run the frontend `dev` or `build` script's paraglide step once (check `packages/frontend/package.json` for the exact command) and retry.

- [ ] **Step 4: Visual check**

Run the app (`vp run dev`), open the profile page, expand each of the four providers. Expected: bash snippets for Claude Code, Codex, Gemini; JSON for Cursor; revision line under each description; caveat text at the bottom.

- [ ] **Step 5: Format, lint, commit**

```bash
vp fmt && vp lint
git add packages/frontend/src/components/ConnectedAgentsSection.tsx packages/frontend/messages/en/account.json
git commit -m "feat(profile): current connect instructions for Claude Code, Codex, Cursor and Gemini CLI"
```

---

### Task 12: Final verification and spec sync

**Files:**
- Modify: `docs/superpowers/specs/2026-09-19-effect-mcp-server-migration-design.md` (spike outcome only)

- [ ] **Step 1: Full checks**

```bash
vp check && vp run typecheck && vp test run
PROJECTPROJECT_TEST_DATABASE_URL=<local url> vp run test:db
grep -rn "@modelcontextprotocol/sdk" packages/backend/src --include='*.ts' | grep -v "\.test\.ts"
```
Expected: all PASS; the grep prints nothing.

- [ ] **Step 2: Record the spike outcome in the spec**

In the "Spike" section, append one sentence stating whether the middleware value reached the handler and which path was implemented.

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/2026-09-19-effect-mcp-server-migration-design.md
git commit -m "docs(spec): record fiber propagation spike outcome"
```

- [ ] **Step 4: Hand off**

Use `superpowers:finishing-a-development-branch` to open the PR from `chore/effect-mcp-server-migration` against `main`.
