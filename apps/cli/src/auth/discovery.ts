import { cliOAuthClient } from "@pp/shared"
import * as Effect from "effect/Effect"
import { HttpClient, HttpClientResponse } from "effect/http"
import * as Schema from "effect/Schema"

import { unreachable } from "../CliFailure"

const ResourceMetadata = Schema.Struct({
  resource: Schema.String,
  authorization_servers: Schema.NonEmptyArray(Schema.String),
  pp_catalog_version: Schema.optional(Schema.String)
})

const AuthorizationServerMetadata = Schema.Struct({
  issuer: Schema.String,
  authorization_endpoint: Schema.String,
  token_endpoint: Schema.String,
  revocation_endpoint: Schema.optional(Schema.String)
})

export type Discovered = Readonly<{
  origin: string
  resource: string
  authorizationEndpoint: string
  tokenEndpoint: string
  revocationEndpoint: string | undefined
  catalogVersion: string | undefined
}>

export const resourceMetadataUrl = (origin: string) =>
  `${origin}/.well-known/oauth-protected-resource${cliOAuthClient.resourcePath}`

export const authorizationServerMetadataUrl = (issuer: string) => {
  const url = new URL(issuer)
  const path = url.pathname === "/" ? "" : url.pathname
  return `${url.origin}/.well-known/oauth-authorization-server${path}`
}

const getJson = <A, I>(url: string, schema: Schema.Codec<A, I>) =>
  Effect.flatMap(HttpClient.HttpClient, (client) =>
    client
      .get(url)
      .pipe(
        Effect.flatMap(HttpClientResponse.filterStatusOk),
        Effect.flatMap(HttpClientResponse.schemaBodyJson(schema))
      )
  )

export const discover = Effect.fn("discover")(function* (origin: string) {
  const notProjectProject = () =>
    unreachable(
      `${origin} doesn't look like a ProjectProject server: it doesn't publish ${resourceMetadataUrl(origin)}. Check the address, or that the server is up to date.`
    )
  const resource = yield* getJson(
    resourceMetadataUrl(origin),
    ResourceMetadata
  ).pipe(Effect.mapError(notProjectProject))
  if (resource.resource !== `${origin}${cliOAuthClient.resourcePath}`) {
    return yield* notProjectProject()
  }
  const issuer = resource.authorization_servers[0]
  const server = yield* getJson(
    authorizationServerMetadataUrl(issuer),
    AuthorizationServerMetadata
  ).pipe(
    Effect.mapError(() =>
      unreachable(
        `${origin} names ${issuer} as its sign-in server, but that server's metadata couldn't be read.`
      )
    )
  )
  const discovered: Discovered = {
    origin,
    resource: resource.resource,
    authorizationEndpoint: server.authorization_endpoint,
    tokenEndpoint: server.token_endpoint,
    revocationEndpoint: server.revocation_endpoint,
    catalogVersion: resource.pp_catalog_version
  }
  return discovered
})
