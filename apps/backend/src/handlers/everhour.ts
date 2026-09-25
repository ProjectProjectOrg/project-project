import { EverhourIntegrations } from "@pp/server-core/everhour/EverhourIntegrations"
import { EverhourTimeTracking } from "@pp/server-core/everhour/EverhourTimeTracking"
import { AppApi, CurrentUser } from "@pp/shared"
import * as Effect from "effect/Effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"

import { dieOnMarkdown } from "./lib"

export const EverhourHandlerLive = HttpApiBuilder.group(
  AppApi,
  "everhour",
  (handlers) =>
    handlers
      .handle("profile", () =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          const integrations = yield* EverhourIntegrations
          return yield* integrations.getProfile(user.id)
        })
      )
      .handle("connectProfile", ({ payload }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          const integrations = yield* EverhourIntegrations
          return yield* integrations.connectProfile(user.id, payload.apiKey)
        })
      )
      .handle("disconnectProfile", () =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          const integrations = yield* EverhourIntegrations
          return yield* integrations.disconnectProfile(user.id)
        })
      )
      .handle("projectStatus", () =>
        Effect.flatMap(EverhourIntegrations, (integrations) =>
          integrations.getProjectStatus()
        ).pipe(dieOnMarkdown)
      )
      .handle("connectProject", () =>
        Effect.flatMap(EverhourIntegrations, (integrations) =>
          integrations.connectProject()
        ).pipe(dieOnMarkdown)
      )
      .handle("syncProject", () =>
        Effect.flatMap(EverhourIntegrations, (integrations) =>
          integrations.syncProject()
        ).pipe(dieOnMarkdown)
      )
      .handle("disconnectProject", () =>
        Effect.flatMap(EverhourIntegrations, (integrations) =>
          integrations.disconnectProject()
        ).pipe(dieOnMarkdown)
      )
      .handle("ticketWorkTypes", ({ params }) =>
        Effect.flatMap(EverhourTimeTracking, (time) =>
          time.workTypesForTicket(params.id)
        ).pipe(dieOnMarkdown)
      )
      .handle("startTicketTimer", ({ params, payload }) =>
        Effect.flatMap(EverhourTimeTracking, (time) =>
          time.startTicketTimer(params.id, payload)
        ).pipe(dieOnMarkdown)
      )
      .handle("startSprintTimer", ({ params, payload }) =>
        Effect.flatMap(EverhourTimeTracking, (time) =>
          time.startSprintTimer(params.id, payload)
        ).pipe(dieOnMarkdown)
      )
      .handle("stopTimer", () =>
        Effect.flatMap(EverhourTimeTracking, (time) => time.stopTimer()).pipe(
          dieOnMarkdown
        )
      )
      .handle("currentTimer", () =>
        Effect.flatMap(EverhourTimeTracking, (time) =>
          time.currentTimer()
        ).pipe(dieOnMarkdown)
      )
      .handle("logTime", ({ payload }) =>
        Effect.flatMap(EverhourTimeTracking, (time) =>
          time.logTime(payload)
        ).pipe(dieOnMarkdown)
      )
      .handle("ticketTime", ({ params }) =>
        Effect.flatMap(EverhourTimeTracking, (time) =>
          time.ticketTimeSummary(params.id)
        ).pipe(dieOnMarkdown)
      )
)
