import * as Client from "@pp/integration-jira/Client"
import * as Credentials from "@pp/integration-jira/Credentials"
import {
  AppApi,
  CurrentUser,
  JiraError,
  JiraResourceNotFound
} from "@pp/shared"
import * as Effect from "effect/Effect"
import { HttpApiBuilder } from "effect/http-api"

export const JiraHandlerLive = HttpApiBuilder.group(
  AppApi,
  "jira",
  (handlers) =>
    handlers
      .handle("profile", () =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          const credentials = yield* Credentials.JiraCredentials
          return yield* credentials.status(user.id)
        })
      )
      .handle("disconnectProfile", () =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          const credentials = yield* Credentials.JiraCredentials
          return yield* credentials.disconnect(user.id)
        })
      )
      .handle("sites", () =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          const client = yield* Client.JiraClient
          return yield* client.accessibleSites(user.id).pipe(
            Effect.mapError(Client.toPublicJiraError),
            Effect.catchTag("JiraResourceNotFound", () =>
              Effect.fail(new JiraError({ reason: "invalid_response" }))
            )
          )
        })
      )
      .handle("projects", ({ params }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          const client = yield* Client.JiraClient
          const sites = yield* client.accessibleSites(user.id).pipe(
            Effect.mapError(Client.toPublicJiraError),
            Effect.catchTag("JiraResourceNotFound", () =>
              Effect.fail(new JiraError({ reason: "invalid_response" }))
            )
          )
          if (!sites.some((site) => site.cloudId === params.cloudId)) {
            return yield* new JiraResourceNotFound()
          }
          return yield* client
            .projects(user.id, params.cloudId)
            .pipe(Effect.mapError(Client.toPublicJiraError))
        })
      )
)
