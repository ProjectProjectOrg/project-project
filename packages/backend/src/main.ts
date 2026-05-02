// packages/backend/src/main.ts
//
// Backend entry point. This file's only job is to wire up the HttpApi from
// the shared package, attach an implementation, and run the resulting Layer
// on a Bun HTTP server.
//
// THE EFFECT MENTAL MODEL (one paragraph)
// ----------------------------------------------------------------------------
// An `Effect<A, E, R>` is a *description* of a computation. It does nothing
// until it is run by a runtime. `Layer<ROut, E, RIn>` is a description of how
// to construct services (the things in the `R` channel). You compose layers
// to build the dependency graph for your program, then a runtime resolves
// it. For HTTP, `@effect/platform` provides ready-made layers: one to
// implement an HttpApi (`HttpApiBuilder.api`), one to actually listen on a
// port (`BunHttpServer.layer` from `@effect/platform-bun`).
//
// CHAPTER 0 GOAL
// ----------------------------------------------------------------------------
// Make `curl http://localhost:3000/health` return {"status":"ok"}.
//
// STEPS
// ----------------------------------------------------------------------------
//   1. Import { AppApi } from "@markmate/shared".
//   2. Import HttpApiBuilder, HttpServer from "@effect/platform".
//   3. Import BunHttpServer, BunRuntime from "@effect/platform-bun".
//   4. Import { Layer } from "effect".
//
//   5. Implement the "health" group with HttpApiBuilder.group:
//        const HealthHandlerLive = HttpApiBuilder.group(AppApi, "health",
//          (handlers) => handlers.handle("get", () =>
//            Effect.succeed({ status: "ok" as const })
//          )
//        )
//      (Group name "health" and endpoint name "get" must match what you
//       declared in shared/api.ts — TypeScript will tell you if they don't.)
//
//   6. Compose the API implementation:
//        const ApiLive = HttpApiBuilder.api(AppApi).pipe(
//          Layer.provide(HealthHandlerLive)
//        )
//
//   7. Build the server layer:
//        const ServerLive = HttpApiBuilder.serve().pipe(
//          Layer.provide(ApiLive),
//          Layer.provide(BunHttpServer.layer({ port: 3000 }))
//        )
//
//   8. Launch it:
//        BunRuntime.runMain(Layer.launch(ServerLive))
//
// THINGS TO LOOK UP WHILE YOU GO
// ----------------------------------------------------------------------------
// - The difference between `Layer.provide` and `Layer.merge`. Provide is
//   directional ("this layer needs that one underneath"); merge is parallel.
// - Why `Layer.launch` rather than `Effect.runPromise`. Layers describe
//   long-lived resources; launch keeps them alive for the lifetime of the
//   process.
// - `BunRuntime.runMain` vs Effect's general runtime — what does the Bun
//   variant add? (Hint: signal handling, exit codes.)

// TODO: imports

// TODO: HealthHandlerLive

// TODO: ApiLive

// TODO: ServerLive

// TODO: BunRuntime.runMain(Layer.launch(ServerLive))

export {}
