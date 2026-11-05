# Exercise 1 — The contract: declare the HttpApi

**File to edit:** `packages/shared/src/api.ts`

## Goal

Declare the smallest possible HttpApi for ProjectProject: a single `GET /health` endpoint inside a `health` group, returning `{ status: "ok" }`. This file is the contract that both the backend and frontend will build on top of in the next exercises.

## Concepts practiced

- `Schema.Struct` and `Schema.Literal` for describing response shapes
- `HttpApiEndpoint`, `HttpApiGroup`, `HttpApi` for describing endpoints, groups, and the API as a whole
- The "value-not-type" idea: `AppApi` is a runtime value that both ends import

## Steps

1. Open `packages/shared/src/api.ts` and read the comments. They name every concept you need.
2. Add the imports at the top: `HttpApi`, `HttpApiGroup`, `HttpApiEndpoint` from `@effect/platform`, and `Schema` from `effect`. (Yes, plain `effect`, not `@effect/schema`. See chapter README.)
3. Define a `HealthResponse` schema describing `{ status: "ok" }`. Use `Schema.Struct({...})` and `Schema.Literal("ok")` — `Literal` is what _narrows_ the string type so consumers see the exact value, not just `string`.
4. Build the group: `HttpApiGroup.make("health")` and chain `.add(HttpApiEndpoint.get("get", "/health").addSuccess(HealthResponse))` onto it. Think about the two names: `"health"` is the group name, `"get"` is the endpoint name. The backend will look up handlers by _both_ names, so they must match exactly later.
5. Build `AppApi`: `HttpApi.make("projectproject").add(HealthGroup)`. Export it.
6. Delete the `export {}` placeholder at the bottom — once you have a real export, it isn't needed.

## Acceptance criteria

- [ ] `bun run typecheck` (or running tsc on the shared package) passes.
- [ ] `import { AppApi } from "@projectproject/shared"` works from the backend and frontend packages (you won't actually import it yet — but no red squiggles).
- [ ] Hovering `AppApi` in your editor shows a type that mentions `health` and `get`.

## Hints

<details>
<summary>Hint 1 — what does the import block look like?</summary>

```ts
import { HttpApi, HttpApiEndpoint, HttpApiGroup } from "@effect/platform"
import { Schema } from "effect"
```

The spec uses `import { Schema as S } from "effect"` to keep call sites short — feel free to follow that or keep `Schema` spelled out. Pick one and stick to it across the file.

</details>

<details>
<summary>Hint 2 — the schema</summary>

```ts
const HealthResponse = Schema.Struct({
  status: Schema.Literal("ok")
})
```

You can also export this and the corresponding `type HealthResponse = typeof HealthResponse.Type`, but it isn't required for Chapter 0.

</details>

<details>
<summary>Hint 3 — chaining shape</summary>

```ts
const HealthGroup = HttpApiGroup.make("health").add(
  HttpApiEndpoint.get("get", "/health").addSuccess(HealthResponse)
)

export const AppApi = HttpApi.make("projectproject").add(HealthGroup)
```

Notice that everything is one big expression — no statements in between. That's because each `.add(...)` returns a new immutable value with the addition baked into its type. Mutating in place would lose the type information.

</details>
