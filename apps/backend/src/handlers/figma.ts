import { FigmaIntegrations } from "@pp/server-core/figma/FigmaIntegrations"
import { FigmaLinks } from "@pp/server-core/figma/FigmaLinks"
import { AppApi, CurrentUser } from "@pp/shared"
import * as Effect from "effect/Effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"

import { dieOnMarkdown } from "./lib"

export const FigmaHandlerLive = HttpApiBuilder.group(
  AppApi,
  "figma",
  (handlers) =>
    handlers
      .handle("profile", () =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          const integrations = yield* FigmaIntegrations
          return yield* integrations.getProfile(user.id)
        })
      )
      .handle("disconnectProfile", () =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          const integrations = yield* FigmaIntegrations
          return yield* integrations.disconnectProfile(user.id)
        })
      )
      .handle("projectStatus", () =>
        Effect.flatMap(FigmaIntegrations, (integrations) =>
          integrations.getProjectStatus()
        ).pipe(dieOnMarkdown)
      )
      .handle("connectProject", ({ payload }) =>
        Effect.flatMap(FigmaIntegrations, (integrations) =>
          integrations.connectProject(payload.accessToken)
        ).pipe(dieOnMarkdown)
      )
      .handle("disconnectProject", () =>
        Effect.flatMap(FigmaIntegrations, (integrations) =>
          integrations.disconnectProject()
        ).pipe(dieOnMarkdown)
      )
      .handle("ticketLinks", ({ params }) =>
        Effect.flatMap(FigmaLinks, (figmaLinks) =>
          figmaLinks.listForTicket(params.id)
        ).pipe(dieOnMarkdown)
      )
)
