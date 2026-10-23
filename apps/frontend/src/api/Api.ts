import { AppApi } from "@pp/shared"
import * as FetchHttpClient from "effect/http/FetchHttpClient"
import * as AtomHttpApi from "effect/reactivity/AtomHttpApi"

export class Api extends AtomHttpApi.Service<Api>()("Api", {
  api: AppApi,
  httpClient: FetchHttpClient.layer,
  baseUrl: "/api"
}) {}
