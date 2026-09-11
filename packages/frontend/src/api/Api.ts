import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient"
import * as AtomHttpApi from "effect/unstable/reactivity/AtomHttpApi"
import { AppApi } from "@projectproject/shared"

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
  httpClient: FetchHttpClient.layer,
  baseUrl: "/api"
}) {}
