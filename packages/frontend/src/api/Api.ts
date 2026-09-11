import * as Layer from "effect/Layer"
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient"
import * as AtomHttpApi from "effect/unstable/reactivity/AtomHttpApi"
import { AppApi } from "@projectproject/shared"

/**
 * `globalThis.fetch` is resolved per call rather than captured at layer build
 * time. Tests replace it with `vi.stubGlobal("fetch", ...)` after the layer has
 * been built, and that only works if the lookup is deferred. Do not inline
 * `FetchHttpClient.layer` here.
 */
const httpClient = Layer.provide(
  FetchHttpClient.layer,
  Layer.succeed(FetchHttpClient.Fetch, ((request, init) =>
    globalThis.fetch(request, init)) as typeof globalThis.fetch)
)

/**
 * The frontend's single API client.
 *
 * - `Api.query(group, endpoint, request)` is the only way to read server state.
 *   The request object is the cache key, so two structurally equal requests
 *   share one atom and one in-flight fetch.
 * - `Api.runtime.fn(...)` builds mutation bodies that can reach the client.
 * - `Api.use((client) => ...)` calls an endpoint inside an Effect.
 */
export class Api extends AtomHttpApi.Service<Api>()("Api", {
  api: AppApi,
  httpClient,
  baseUrl: "/api"
}) {}
