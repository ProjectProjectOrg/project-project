import {
  AppApi,
  CurrentUser,
  JiraError,
  JiraResourceNotFound
} from "@projectproject/shared"
import * as Effect from "effect/Effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { JiraClient, toPublicJiraError } from "./Client"
import { JiraCredentials } from "./Credentials"

export const JiraHandlerLive = HttpApiBuilder.group(
  AppApi,
  "jira",
  (handlers) =>
    handlers
      .handle("profile", () =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          const credentials = yield* JiraCredentials
          return yield* credentials.status(user.id)
        })
      )
      .handle("disconnectProfile", () =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          const credentials = yield* JiraCredentials
          return yield* credentials.disconnect(user.id)
        })
      )
      .handle("sites", () =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          const client = yield* JiraClient
          return yield* client.accessibleSites(user.id).pipe(
            Effect.mapError(toPublicJiraError),
            Effect.catchTag("JiraResourceNotFound", () =>
              Effect.fail(new JiraError({ reason: "invalid_response" }))
            )
          )
        })
      )
      .handle("projects", ({ params }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          const client = yield* JiraClient
          const sites = yield* client.accessibleSites(user.id).pipe(
            Effect.mapError(toPublicJiraError),
            Effect.catchTag("JiraResourceNotFound", () =>
              Effect.fail(new JiraError({ reason: "invalid_response" }))
            )
          )
          if (!sites.some((site) => site.cloudId === params.cloudId)) {
            return yield* new JiraResourceNotFound()
          }
          return yield* client
            .projects(user.id, params.cloudId)
            .pipe(Effect.mapError(toPublicJiraError))
        })
      )
)
