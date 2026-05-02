// packages/frontend/src/services/ApiClient.ts
//
// THE TYPED CLIENT, DERIVED FROM THE SHARED CONTRACT.
// ----------------------------------------------------------------------------
// `HttpApiClient.make(AppApi)` reads the shared API definition (the same
// `AppApi` value the backend implements) and returns a fully typed client.
// `client.health.get()` is autocompleted, the response type is inferred,
// and any errors you declared with `.addError(...)` show up in the Effect's
// `E` channel. There is no codegen step — this is straight TypeScript.
//
// We wrap the client in a `Context.Tag` and a `Layer` for two reasons:
//   1. The HTTP transport (FetchHttpClient) is itself a layer the client
//      needs underneath it; layers express that dependency cleanly.
//   2. In tests, we can swap `ApiClientLive` for a fake layer without
//      touching component code. This is the entire pitch of Effect's
//      dependency injection.
//
// CHAPTER 0 STEPS
// ----------------------------------------------------------------------------
//   1. Imports:
//        import { Context, Effect, Layer } from "effect"
//        import { FetchHttpClient, HttpApiClient } from "@effect/platform"
//        import { AppApi } from "@markmate/shared"
//
//   2. Declare the Tag:
//        export class ApiClient extends Context.Tag("ApiClient")<
//          ApiClient,
//          HttpApiClient.Client<typeof AppApi>
//        >() {}
//
//   3. Build the live layer:
//        export const ApiClientLive = Layer.effect(
//          ApiClient,
//          HttpApiClient.make(AppApi, { baseUrl: "/api" }),
//        ).pipe(Layer.provide(FetchHttpClient.layer))
//
// You are *describing* how to build an ApiClient — not building one yet.
// The first call to `Effect.runPromise(...).pipe(Effect.provide(ApiClientLive))`
// is when the layer is actually constructed.

// TODO: imports

// TODO: export class ApiClient extends Context.Tag(...)<...>() {}

// TODO: export const ApiClientLive = Layer.effect(ApiClient, ...).pipe(Layer.provide(FetchHttpClient.layer))

export {}
