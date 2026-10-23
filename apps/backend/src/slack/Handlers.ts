import { SlackIntegrations } from "@pp/integration-slack/Integrations"
import { AppApi, CurrentUser } from "@pp/shared"
import * as Effect from "effect/Effect"
import { HttpApiBuilder } from "effect/http-api"

export const SlackHandlerLive = HttpApiBuilder.group(
  AppApi,
  "slack",
  (handlers) =>
    handlers
      .handle("orgStatus", () =>
        Effect.flatMap(SlackIntegrations, (slack) => slack.orgStatus())
      )
      .handle("connectOrg", ({ payload }) =>
        Effect.flatMap(SlackIntegrations, (slack) => slack.connectOrg(payload))
      )
      .handle("disconnectOrg", () =>
        Effect.flatMap(SlackIntegrations, (slack) => slack.disconnectOrg())
      )
      .handle("manifest", () =>
        Effect.flatMap(SlackIntegrations, (slack) => slack.manifest())
      )
      .handle("channels", () =>
        Effect.flatMap(SlackIntegrations, (slack) => slack.channels())
      )
      .handle("projectStatus", () =>
        Effect.flatMap(SlackIntegrations, (slack) => slack.projectStatus())
      )
      .handle("saveProject", ({ payload }) =>
        Effect.flatMap(SlackIntegrations, (slack) => slack.saveProject(payload))
      )
      .handle("disconnectProject", () =>
        Effect.flatMap(SlackIntegrations, (slack) => slack.disconnectProject())
      )
      .handle("testProject", () =>
        Effect.flatMap(SlackIntegrations, (slack) => slack.testProject())
      )
      .handle("profiles", () =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          return yield* (yield* SlackIntegrations).profiles(user.id)
        })
      )
      .handle("disconnectProfile", () =>
        Effect.flatMap(SlackIntegrations, (slack) => slack.disconnectProfile())
      )
)
