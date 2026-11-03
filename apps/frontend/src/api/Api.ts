import { AppApi, LIVE_ORIGIN_HEADER } from "@pp/shared"
import * as FetchHttpClient from "effect/http/FetchHttpClient"
import * as HttpClient from "effect/http/HttpClient"
import * as HttpClientRequest from "effect/http/HttpClientRequest"
import * as AtomHttpApi from "effect/reactivity/AtomHttpApi"

import { clientId } from "./clientId"

export class Api extends AtomHttpApi.Service<Api>()("Api", {
  api: AppApi,
  httpClient: FetchHttpClient.layer,
  transformClient: HttpClient.mapRequest(
    HttpClientRequest.setHeader(LIVE_ORIGIN_HEADER, clientId)
  ),
  baseUrl: "/api"
}) {}
