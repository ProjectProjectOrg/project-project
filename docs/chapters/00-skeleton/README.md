# Chapter 0 — Skeleton

## What this chapter teaches

By the end of this chapter you will have a tiny full-stack slice of ProjectProject running end-to-end:

- A shared **HttpApi** declaration (`packages/shared/src/api.ts`) that describes one endpoint: `GET /health` returning `{ status: "ok" }`.
- A **backend** (`packages/backend/src/main.ts`) that _implements_ that API and serves it on `http://localhost:3000` via Bun.
- A **frontend** (`packages/frontend/src/...`) that _consumes_ the API through a fully-typed client derived from the same `AppApi` value, and renders the response on `/`.

That sounds trivial — and it is — but the point isn't the endpoint. The point is to see, in your own editor, the moment where the _type_ of `AppApi` flows from `shared/` into both the backend's handler and the frontend's client. No codegen step, no OpenAPI file passed between processes, no `fetch("/health")` with a hand-written response type. Once that loop is real, every later chapter just adds endpoints to it.

Phase 0 in `docs/PROJECTPROJECT.md` says: _"You've now seen the full Effect ↔ TanStack Start loop work end-to-end. This is the moment that tells you the stack is real."_ That moment is what this chapter is for.

## Concepts

### 1. `Effect<A, E, R>` — a description, not an action

Every value you build with the Effect library is a _plan_. `Effect.succeed(42)` is a plan that, when run, will produce `42`. `Effect.fail(new Error("nope"))` is a plan that fails. Until you hand a plan to a runtime (e.g. `Effect.runPromise`, `BunRuntime.runMain`), nothing happens.

The three type parameters of `Effect<A, E, R>` are:

- `A` — what it produces on success
- `E` — what it can fail with (a _known set_ of errors, not `unknown`)
- `R` — what services it needs in scope to run (the "requirement" channel)

Most plumbing in Effect is about turning an `Effect<A, E, R>` with some `R` into an `Effect<A, E, never>` — i.e. a plan whose dependencies are all satisfied — so the runtime can execute it. That's what `Layer` is for (next concept).

### 2. `Layer<ROut, E, RIn>` — how to build services

A `Layer<ROut, E, RIn>` describes how to construct services of type `ROut`, given services of type `RIn` and possibly failing with `E`. Layers compose: if A depends on B, and B depends on C, you can `Layer.provide` them and end up with a single layer that builds the whole tree.

You will not need to _write_ a layer in Chapter 0 — you only consume two:

- `BunHttpServer.layer({ port: 3000 })` from `@effect/platform-bun` — provides an `HttpServer` service backed by Bun's native HTTP.
- `FetchHttpClient.layer` from `@effect/platform` — provides an `HttpClient` backed by the browser's `fetch`.

Plus you'll _use_ `Layer.effect` and `Layer.provide` to wire them together.

### 3. `Schema` — the boundary between trusted and untrusted data

Effect's `Schema` module describes the shape of data, with both compile-time types and runtime decoders. Where in plain TypeScript you'd write:

```ts
type HealthResponse = { status: "ok" }
```

…in Effect you write:

```ts
import { Schema } from "effect"

const HealthResponse = Schema.Struct({
  status: Schema.Literal("ok")
})
type HealthResponse = typeof HealthResponse.Type
```

The two look similar, but `HealthResponse` is now a _runtime value_. You can hand it to `HttpApiEndpoint.addSuccess(HealthResponse)` to tell the API layer how to serialize/deserialize the response, and you can hand it to `Schema.decodeUnknown(HealthResponse)` to validate untrusted input at a boundary.

> **Gotcha — Effect v3:** `Schema` lives in the main `effect` package (`import { Schema } from "effect"`). On v4-beta it moved to `effect/unstable/schema`. We're on v3 stable. If you find a tutorial that imports from `@effect/schema`, that's the _old_ package name; same story, before Schema was merged into core.

### 4. `HttpApi` — the contract

`@effect/platform`'s `HttpApi` lets you describe an HTTP API as a value. Three building blocks, hierarchically:

```ts
HttpApiEndpoint.get("get", "/health")     // one endpoint
  .addSuccess(HealthResponse)

HttpApiGroup.make("health")               // a group of related endpoints
  .add(...)

HttpApi.make("projectproject")                  // the whole API
  .add(HealthGroup)
```

Why the group layer when there's only one endpoint? Because the _implementation_ side groups handlers by group name, so even with one endpoint you go through the group. Later groups will be `auth`, `projects`, `tickets`.

The crucial insight: **`AppApi` is just a value**. The backend imports it and implements it via `HttpApiBuilder`. The frontend imports the _same_ value and asks `HttpApiClient.make` to derive a typed client from it. The contract isn't a file format — it's a TypeScript type, and TypeScript checks both sides against it.

### 5. Declaring a service: `Effect.Service` vs `Context.Tag`

A "service" in Effect is whatever ends up in an Effect's `R` channel — the things you `yield*` inside `Effect.gen`. To put something there, you declare it with one of two patterns:

**`Context.Tag` + `Layer.effect`** — the explicit, two-step version:

```ts
export class Markdown extends Context.Tag("Markdown")<
  Markdown,
  { readonly read: (path: string) => Effect.Effect<string, MarkdownError> }
>() {}

export const MarkdownLive = Layer.effect(
  Markdown
  /* an Effect that builds it */
)
```

You hand-write the service _shape_ (the second type argument), then separately write a Layer that produces a value of that shape. This is the right tool when _you_ are designing the interface — you'll write services like this in Chapter 2 (`Markdown`, `Projects`, `Tickets`).

**`Effect.Service`** — the bundled version, when the shape comes from an existing Effect:

```ts
export class ApiClient extends Effect.Service<ApiClient>()(
  "ApiClient",
  {
    effect: HttpApiClient.make(AppApi, { baseUrl: "/api" }),
    dependencies: [FetchHttpClient.layer]
  }
) {}
```

Here you don't spell out the service shape — `Effect.Service` infers it from the success type of the `effect:` field. You also get `ApiClient.Default` (the Layer) for free, with `dependencies:` already provided into it. This is the right tool when the shape is whatever a library function returns to you (`HttpApiClient.make` here), and writing it out by hand would mean fighting TypeScript generics for no teaching value.

For Chapter 0 you'll use `Effect.Service` for `ApiClient`. From Chapter 2 onward you'll use `Context.Tag` for the services you define yourself.

> **Gotcha:** older Effect tutorials (and `docs/PROJECTPROJECT.md`) show `Context.Tag` for `ApiClient` with `HttpApiClient.Client<typeof AppApi>` as the shape. That stopped working when `Client` started taking three type generics. `Effect.Service` sidesteps the change.

### 6. `BunRuntime.runMain` and `Layer.launch`

To start the backend, you do:

```ts
BunRuntime.runMain(Layer.launch(ServerLive))
```

`Layer.launch` takes a `Layer<never, E, never>` (a fully self-contained layer) and turns it into an `Effect` that builds the layer and _keeps it alive_ until interrupted. `BunRuntime.runMain` is a Bun-flavored runner that wires up signal handling and exit codes — so Ctrl+C cleanly shuts the server down. Don't reach for `Effect.runPromise` here; servers aren't promises.

### 7. Why the frontend code feels awkward in this chapter

In the route component you'll write something like:

```tsx
useEffect(() => {
  const program = Effect
    .gen(function*() {
      const client = yield* ApiClient
      return yield* client.health.get()
    })
    .pipe(Effect.provide(ApiClient.Default))
  Effect.runPromise(program).then(setData)
}, [])
```

That is _ugly_. Every component would have to remember to provide the layer; nothing caches the result; loading/error UI is on you. This pain is intentional — Chapter 1 (or wherever atoms land) introduces `@effect-atom/atom-react` as the principled solution. Feel the pain first.

## Further reading

- Effect — Getting Started: <https://effect.website/docs/getting-started/why-effect/>
- Effect — `Schema` (v3 docs): <https://effect.website/docs/schema/introduction/>
- Effect — `Layer` and dependency management: <https://effect.website/docs/requirements-management/layers/>
- `@effect/platform` HttpApi: <https://effect.website/docs/platform/http-api/>
- `@effect/platform-bun`: <https://github.com/Effect-TS/effect/tree/main/packages/platform-bun>
- TanStack Router file-based routing: <https://tanstack.com/router/latest/docs/framework/react/guide/file-based-routing>
- Bun's native HTTP server (the thing under `BunHttpServer.layer`): <https://bun.com/docs/api/http>

If a link 404s on the Effect site, it usually means the docs were reorganized — the search box at the top still works.

## Exercises

The repo already contains stub files at the paths each exercise touches. The stubs have `TODO:` comments pointing at exactly which lines to fill in. Each exercise below is the _thinking_ layer on top of those TODOs.

1. [The contract — declare the HttpApi](./exercises/01-health-contract.md)
2. [The implementation — serve `/health` from Bun](./exercises/02-implement-server.md)
3. [The typed client — derive a client layer](./exercises/03-typed-client.md)
4. [Close the loop — call the API from `/`](./exercises/04-call-from-route.md)
5. [Your first Effect-aware test](./exercises/05-first-test.md)
