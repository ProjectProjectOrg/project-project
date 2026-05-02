# Exercise 5 — Your first Effect-aware test

**File to edit:** `packages/backend/src/main.test.ts`

## Goal

Lock down `HealthHandlerLive`'s behavior with one integration test: when `GET /health` is dispatched against the in-process API, the response is `200` with body `{ status: "ok" }`. Once this passes, you've established the test pattern you'll reuse for every backend handler in later chapters.

## Concepts practiced

- `it.effect(...)` from `@effect/vitest` — running an `Effect` program as a test case
- `HttpApiBuilder.toWebHandler(layer)` — turning an API layer into a plain `Request → Promise<Response>` function so tests don't have to bind a port
- `Effect.promise` — bridging from a Promise-producing API back into Effect's generator world
- The `import.meta.main` guard — why your test importing `main.ts` doesn't try to start a server

## Setup recap (already done for you)

- `vitest` and `@effect/vitest` installed in `packages/backend`
- `vitest.config.ts` pointing at `src/**/*.test.ts`, Node environment
- `bun run --filter @projectproject/backend test` runs the suite (also `bun run test` from the repo root)
- `main.ts` exports `HealthHandlerLive` and `ApiLive` so tests can compose them; the `BunRuntime.runMain(...)` line is wrapped in `if (import.meta.main) { ... }` so importing the module doesn't try to bind the port
- `main.test.ts` exists with imports and a single `it.effect` skeleton — the assertions are TODOs
- The `toWebHandler(...)` call merges `ApiLive` with `HttpServer.layerContext`. `toWebHandler` requires the API layer **and** the HttpRouter default services — in production those default services arrive bundled inside `BunHttpServer.layer`, but tests don't want a real server. `HttpServer.layerContext` is the platform-agnostic shim that supplies them without binding a port. Worth pausing on: this is the compiler telling you that peeling a layer off the top of a working stack means you have to replace what that top layer was contributing.

## Steps

1. Run `bun run --filter @projectproject/backend test` once. The skeleton should pass with no assertions (vitest counts a test that doesn't `expect` anything as passing). Verifies your local setup before you change anything.
2. Open `packages/backend/src/main.test.ts`. Read the comments at the top — they explain `toWebHandler`, `it.effect`, and what you're being asked to verify.
3. Inside the `it.effect` body, add the two assertions the TODOs ask for:
   - `response.status` is `200`.
   - The parsed JSON body equals `{ status: "ok" }`.
4. Run the suite again. It should pass.
5. **Sanity check the test actually exercises something:** in `main.ts`, change `"ok" as const` to something else (e.g. `"oki" as const`). Re-run the test — you'll get a TypeScript error from the schema mismatch (the contract earning its keep) before the test even runs. That's the first line of defense.

   For a runtime-failure check, comment out the schema validation by leaving `"ok" as const` but changing the response shape — e.g. `Effect.succeed({ status: "ok" as const, extra: "x" })` would still satisfy the schema (extra fields are fine by default) but wouldn't change the assertion. Better: change `Effect.succeed({...})` to `Effect.fail(new Error("boom"))` and watch the test fail with the right error. Restore.

## Acceptance criteria

- [ ] `bun run --filter @projectproject/backend test` passes with the assertions in place.
- [ ] Forcing the handler to fail (e.g. `Effect.fail(new Error("..."))`) makes the test fail — proves your assertions actually run.
- [ ] You wrote both assertions inside a single `it.effect(...)` block, not split across two tests.

## Hints

<details>
<summary>Hint 1 — getting the JSON body inside an Effect</summary>

`response.json()` returns `Promise<unknown>`. To stay inside the `Effect.gen` block, wrap it:

```ts
Effect.gen(function*() {
  // ...response already in scope from the previous yield*...
  const body = yield* Effect.promise(() => response.json())
})
```

You _could_ break out of the generator and `await` it after `Effect.runPromise`, but mixing styles in a 5-line test is uglier than just staying in Effect-land.

</details>

<details>
<summary>Hint 2 — full assertions</summary>

```ts
Effect.gen(function*() {
  const response = yield* Effect.promise(() =>
    handler(new Request("http://localhost/health"))
  )

  expect(response.status).toBe(200)

  const body = yield* Effect.promise(() => response.json())
  expect(body).toEqual({ status: "ok" })
})
```

`toEqual` does deep equality on plain objects. `toBe` is reference equality, fine for primitives like the status code.

</details>

<details>
<summary>Hint 3 — why <code>it.effect</code> and not regular <code>it</code>?</summary>

You don't strictly need it for this test — `await handler(...)` would work in a plain async `it`. But:

1. `it.effect` is what every later test uses (mocking layers, asserting failure types, etc.). Building muscle memory now is cheaper than re-learning later.
2. It lets you compose Effect programs naturally (`yield*` instead of `await`), which matters once handlers _do_ involve services.

The convention in this repo: backend handler tests always use `it.effect`. Plain `it` is reserved for things that don't touch the Effect runtime at all.

</details>

## What's next

Once your test is green, ping me and I'll add coverage:

- Asserting the `Content-Type` header is JSON
- Asserting that an unknown route (e.g. `GET /nope`) returns 404
- A second style of test using `HttpApiClient.make(AppApi)` with an in-process transport — same client the frontend uses, full type-checked. Worth seeing both styles before Chapter 1 introduces real services with mockable dependencies.
