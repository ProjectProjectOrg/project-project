import { FetchHttpClient } from "@effect/platform"
import { AtomHttpApi } from "@effect-atom/atom-react"
import { AppApi } from "@projectproject/shared"

export const AppApiClient = AtomHttpApi.Tag<"AppApiClient">()("AppApiClient", {
  api: AppApi,
  httpClient: FetchHttpClient.layer,
  baseUrl: "/api"
})
