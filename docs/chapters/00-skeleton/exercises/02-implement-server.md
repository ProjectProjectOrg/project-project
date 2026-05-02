# Exercise 2 — The implementation: serve `/health` from Bun

**File to edit:** `packages/backend/src/main.ts`

## Goal

Stand up an HTTP server that implements the `AppApi` contract, serving `GET /health` with `{ status: "ok" }` on `http://localhost:3000`. By the end you should be able to `curl http://localhost:3000/health` from another terminal and see the JSON.

## Concepts practiced

- Implementing an `HttpApi` group with `HttpApiBuilder.group`
- Composing layers with `Layer.provide`
- The difference between an `Effect` (one-shot) and a long-lived layer launched with `Layer.launch`
- `BunRuntime.runMain` as the right way to start a server program

## Steps

1. Read the comments in `packages/backend/src/main.ts`. They walk through the wiring step by step. Don't skim them — they explain _why_ each piece exists.
2. Add the imports the comments call for. You need `AppApi` from `@projectproject/shared`, `HttpApiBuilder` from `@effect/platform`, `BunHttpServer` and `BunRuntime` from `@effect/platform-bun`, and `Effect` and `Layer` from `effect`.
3. Implement the handler with `HttpApiBuilder.group(AppApi, "health", (handlers) => handlers.handle("get", () => ...))`. The handler body is just `Effect.succeed({ status: "ok" as const })`. The `as const` matters — without it the literal widens to `string` and stops matching the schema.
4. Build `ApiLive` by piping the API builder through `Layer.provide(HealthHandlerLive)`. `HttpApiBuilder.api(AppApi)` returns a layer that _needs_ a handler for every group; you provide that need with the line you just wrote.
5. Build `ServerLive` by piping `HttpApiBuilder.serve()` through both `Layer.provide(ApiLive)` and `Layer.provide(BunHttpServer.layer({ port: 3000 }))`. Order doesn't matter — you're saying "this layer needs both of those things satisfied."
6. Launch it: `BunRuntime.runMain(Layer.launch(ServerLive))`.
7. Run `bun run --filter @projectproject/backend dev` and `curl http://localhost:3000/health`. You want `{"status":"ok"}`.

## Acceptance criteria

- [ ] `bun run --filter @projectproject/backend dev` starts without errors and stays running.
- [ ] `curl http://localhost:3000/health` returns `{"status":"ok"}` with a 200.
- [ ] If you change the endpoint name in `shared/api.ts` (e.g. `"get"` → `"check"`), `main.ts` shows a TypeScript error on the corresponding `handlers.handle(...)` call. Change it back. (This is the contract earning its keep.)
- [ ] Ctrl+C cleanly stops the server (no zombie process; that's `BunRuntime.runMain` doing its job).

## Hints

<details>
<summary>Hint 1 — why `Layer.provide` and not `Layer.merge`?</summary>

`Layer.merge(A, B)` says "give me a layer that provides both A's outputs and B's outputs." `Layer.provide(B)` applied to A says "B is a _dependency_ of A — feed B's outputs into A's inputs." Provide is directional; merge is parallel. The server needs the API implementation, the API implementation needs the handler — that's a chain of dependencies, so it's `provide` all the way down.

</details>

<details>
<summary>Hint 2 — full skeleton</summary>

```ts
import { HttpApiBuilder } from "@effect/platform"
import { BunHttpServer, BunRuntime } from "@effect/platform-bun"
import { Effect, Layer } from "effect"
import { AppApi } from "@projectproject/shared"

const HealthHandlerLive = HttpApiBuilder.group(
  AppApi,
  "health",
  (handlers) =>
    handlers.handle("get", () => Effect.succeed({ status: "ok" as const }))
)

const ApiLive = HttpApiBuilder.api(AppApi).pipe(
  Layer.provide(HealthHandlerLive)
)

const ServerLive = HttpApiBuilder.serve().pipe(
  Layer.provide(ApiLive),
  Layer.provide(BunHttpServer.layer({ port: 3000 }))
)

BunRuntime.runMain(Layer.launch(ServerLive))
```

If you peek at this hint before trying — that's fine, but go back and _re-derive_ it from the comments without looking. The shape is something you'll write variations of for every chapter.

</details>

<details>
<summary>Hint 3 — common error: `Type '{ status: string }' is not assignable to ...`</summary>

That's the `as const` issue from step 3. `Effect.succeed({ status: "ok" })` infers `{ status: string }`. Add `as const` (`{ status: "ok" as const }`) so the literal type survives, or annotate the return type explicitly. The schema demands `Schema.Literal("ok")`, not any string.

</details>
