# Exercise 3 — The typed client: derive a client layer

**File to edit:** `packages/frontend/src/services/ApiClient.ts`

## Goal

Build the frontend's typed client for `AppApi` and expose it as a service the rest of the app can depend on. The client is _derived_ from the same `AppApi` value the backend implements — that's the whole magic of Chapter 0.

## Concepts practiced

- `HttpApiClient.make(AppApi)` as derivation, not codegen
- `Effect.Service` as the modern one-shot way to declare a Tag + Layer + service shape
- Service dependencies — `FetchHttpClient.layer` provides the HTTP transport the client needs underneath

## Why `Effect.Service` and not `Context.Tag`?

You'll meet two ways to declare a service in Effect:

| Pattern                             | Where it shines                                                                  |
| ----------------------------------- | -------------------------------------------------------------------------------- |
| `Context.Tag` + `Layer.effect`      | When _you_ define the service shape (e.g. `Markdown`, `Projects` in Chapter 2+). |
| `Effect.Service` (the helper class) | When the service shape is whatever some other Effect returns (like this one).    |

`HttpApiClient.make(AppApi, ...)` returns `Effect<HttpApiClient.Client<...>, ...>`, and that `Client` type takes three generics in current `@effect/platform`. With `Effect.Service`, the success type is _inferred_ from the `effect:` field, so you sidestep that whole generic-extraction puzzle and get:

- a Tag (the class itself)
- a Layer (`ApiClient.Default`)
- the right service type, with no `Client<...>` to hand-write

…all from one declaration.

## Steps

1. Open `packages/frontend/src/services/ApiClient.ts`. The comments at the top explain the _why_; this exercise focuses on the _how_.
2. Add the imports: `Effect` from `effect`; `FetchHttpClient`, `HttpApiClient` from `@effect/platform`; `AppApi` from `@projectproject/shared`.
3. Declare the service:

   ```ts
   export class ApiClient extends Effect.Service<ApiClient>()("ApiClient", {
     effect: HttpApiClient.make(AppApi, { baseUrl: "/api" }),
     dependencies: [FetchHttpClient.layer]
   }) {}
   ```

   What each piece does:
   - `Effect.Service<ApiClient>()` — the leading `<ApiClient>()` tells the helper "the class identity is `ApiClient` itself." The dangling `()` is the call that returns the actual class factory; you _then_ call that with the key + options.
   - `"ApiClient"` — the Tag's identifier (used in error messages, like `Context.Tag("ApiClient")` would be).
   - `effect:` — how to build the service. The success type of this Effect _is_ the service's runtime shape. Here it's `HttpApiClient.Client<...>`, which gives you `client.health.get()` autocomplete.
   - `dependencies:` — layers the `effect:` field needs. Anything in here is `Layer.provide`-d under the hood, so the resulting `ApiClient.Default` layer has a clean `RIn = never`. The `baseUrl: "/api"` lines up with the Vite proxy in `packages/frontend/vite.config.ts` — `/api/health` → `http://localhost:3000/health`.

4. Save. The `editor.formatOnSave` should reformat to your dprint style.
5. Confirm `bun run --filter @projectproject/frontend typecheck` passes.

## Acceptance criteria

- [ ] `bun run --filter @projectproject/frontend typecheck` passes.
- [ ] Hovering `ApiClient.Default` in your editor shows roughly `Layer<ApiClient, never, never>` — i.e. no leftover `RIn`. That's `dependencies:` doing its job.
- [ ] In Exercise 4 you'll write `Effect.provide(ApiClient.Default)` and TypeScript will accept it without complaint.

## Hints

<details>
<summary>Hint 1 — that funny `<ApiClient>()` syntax</summary>

`Effect.Service<ApiClient>()` is a curried call. The first set of brackets passes the class identity (the type `ApiClient`, which refers to the class you're _currently declaring_ — TypeScript handles the self-reference). The trailing `()` invokes the factory and returns a class you then `extends`. This is the same trick `Context.Tag` uses; you've seen it before. Once you write it, the shape is muscle memory.

</details>

<details>
<summary>Hint 2 — full file (after the comment block)</summary>

```ts
import { FetchHttpClient, HttpApiClient } from "@effect/platform"
import { AppApi } from "@projectproject/shared"
import { Effect } from "effect"

export class ApiClient extends Effect.Service<ApiClient>()("ApiClient", {
  effect: HttpApiClient.make(AppApi, { baseUrl: "/api" }),
  dependencies: [FetchHttpClient.layer]
}) {}
```

That's the whole file (plus the teaching comments at the top).

</details>

<details>
<summary>Hint 3 — what is <code>FetchHttpClient.layer</code> doing?</summary>

`HttpApiClient.make` doesn't actually call `fetch` — it builds a request object and hands it to whatever `HttpClient` service is in scope. `FetchHttpClient.layer` is the implementation that fulfils that requirement using the browser's `fetch`. In tests you might swap it for a fake; in Node SSR you'd swap it for `NodeHttpClient`.

If you forget the `dependencies` field, TypeScript will tell you: `ApiClient.Default` will have `HttpClient` in its `RIn` channel and refuse to be provided cleanly later.

</details>

<details>
<summary>Hint 4 — old <code>Context.Tag</code> docs you might find online</summary>

A lot of Effect tutorials (and the original `docs/PROJECTPROJECT.md` in this repo) show:

```ts
export class ApiClient extends Context.Tag("ApiClient")<
  ApiClient,
  HttpApiClient.Client<typeof AppApi>
>() {}
```

That stopped compiling when `HttpApiClient.Client` started taking three generics instead of one. `Effect.Service` infers around the change. We'll still use `Context.Tag` for hand-rolled services in Chapter 2 — it's not deprecated, just not the right tool here.

</details>
