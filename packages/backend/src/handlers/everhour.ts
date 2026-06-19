import { HttpApiBuilder } from "@effect/platform"
import { AppApi, CurrentUser } from "@projectproject/shared"
import * as Effect from "effect/Effect"
import { CurrentOrg } from "../Services/CurrentOrg"
import { EverhourIntegrations } from "../Services/EverhourIntegrations"
import { EverhourTimeTracking } from "../Services/EverhourTimeTracking"

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
      .handle("projectStatus", ({ path }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          const currentOrg = yield* CurrentOrg
          const org = yield* currentOrg.resolve(path.orgSlug, user.id)
          const integrations = yield* EverhourIntegrations
          return yield* integrations.getProjectStatus(
            org.orgSlug,
            user.id,
            path.slug
          )
        })
      )
      .handle("connectProject", ({ path }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          const currentOrg = yield* CurrentOrg
          const org = yield* currentOrg.resolve(path.orgSlug, user.id)
          const integrations = yield* EverhourIntegrations
          return yield* integrations.connectProject(
            org.orgSlug,
            user.id,
            path.slug
          )
        })
      )
      .handle("syncProject", ({ path }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          const currentOrg = yield* CurrentOrg
          const org = yield* currentOrg.resolve(path.orgSlug, user.id)
          const integrations = yield* EverhourIntegrations
          return yield* integrations.syncProject(
            org.orgSlug,
            user.id,
            path.slug
          )
        })
      )
      .handle("disconnectProject", ({ path }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          const currentOrg = yield* CurrentOrg
          const org = yield* currentOrg.resolve(path.orgSlug, user.id)
          const integrations = yield* EverhourIntegrations
          return yield* integrations.disconnectProject(
            org.orgSlug,
            user.id,
            path.slug
          )
        })
      )
      .handle("ticketWorkTypes", ({ path }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          const currentOrg = yield* CurrentOrg
          const org = yield* currentOrg.resolve(path.orgSlug, user.id)
          const time = yield* EverhourTimeTracking
          return yield* time.workTypesForTicket(
            org.orgSlug,
            user.id,
            path.slug,
            path.id
          )
        })
      )
      .handle("startTicketTimer", ({ path, payload }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          const currentOrg = yield* CurrentOrg
          const org = yield* currentOrg.resolve(path.orgSlug, user.id)
          const time = yield* EverhourTimeTracking
          return yield* time.startTicketTimer(
            org.orgSlug,
            user.id,
            path.slug,
            path.id,
            payload
          )
        })
      )
      .handle("startSprintTimer", ({ path, payload }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          const currentOrg = yield* CurrentOrg
          const org = yield* currentOrg.resolve(path.orgSlug, user.id)
          const time = yield* EverhourTimeTracking
          return yield* time.startSprintTimer(
            org.orgSlug,
            user.id,
            path.slug,
            path.id,
            payload
          )
        })
      )
      .handle("stopTimer", ({ path }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          const currentOrg = yield* CurrentOrg
          const org = yield* currentOrg.resolve(path.orgSlug, user.id)
          const time = yield* EverhourTimeTracking
          return yield* time.stopTimer(org.orgSlug, user.id)
        })
      )
      .handle("currentTimer", ({ path }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          const currentOrg = yield* CurrentOrg
          const org = yield* currentOrg.resolve(path.orgSlug, user.id)
          const time = yield* EverhourTimeTracking
          return yield* time.currentTimer(org.orgSlug, user.id)
        })
      )
      .handle("logTime", ({ path, payload }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          const currentOrg = yield* CurrentOrg
          const org = yield* currentOrg.resolve(path.orgSlug, user.id)
          const time = yield* EverhourTimeTracking
          return yield* time.logTime(org.orgSlug, user.id, path.slug, payload)
        })
      )
      .handle("ticketTime", ({ path }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          const currentOrg = yield* CurrentOrg
          const org = yield* currentOrg.resolve(path.orgSlug, user.id)
          const time = yield* EverhourTimeTracking
          return yield* time.ticketTimeSummary(
            org.orgSlug,
            user.id,
            path.slug,
            path.id
          )
        })
      )
)
