import { EverhourIntegrations } from "@pp/server-core/everhour/EverhourIntegrations"
import { CurrentOrg } from "@pp/server-core/organizations/CurrentOrg"
import { Tags } from "@pp/server-core/tags/Tags"
import { Tickets } from "@pp/server-core/tickets/Tickets"
import { AppApi, CurrentUser } from "@pp/shared"
import * as Effect from "effect/Effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"

import { dieOnMarkdown } from "./lib"

export const TagsHandlerLive = HttpApiBuilder.group(
  AppApi,
  "tags",
  (handlers) =>
    handlers
      .handle("list", ({ params }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          const currentOrg = yield* CurrentOrg
          const org = yield* currentOrg.resolve(params.orgSlug, user.id)
          const tags = yield* Tags
          return yield* tags.list(org.orgSlug, user.id, params.slug)
        })
      )
      .handle("usageCounts", ({ params }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          const currentOrg = yield* CurrentOrg
          const org = yield* currentOrg.resolve(params.orgSlug, user.id)
          const tickets = yield* Tickets
          return yield* tickets.tagUsageCounts(
            org.orgSlug,
            user.id,
            params.slug
          )
        }).pipe(dieOnMarkdown)
      )
      .handle("create", ({ params, payload }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          const currentOrg = yield* CurrentOrg
          const org = yield* currentOrg.resolve(params.orgSlug, user.id)
          const tags = yield* Tags
          return yield* tags.create(org.orgSlug, user.id, params.slug, payload)
        })
      )
      .handle("update", ({ params, payload }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          const currentOrg = yield* CurrentOrg
          const org = yield* currentOrg.resolve(params.orgSlug, user.id)
          const tags = yield* Tags
          const result = yield* tags.update(
            org.orgSlug,
            user.id,
            params.slug,
            params.name,
            payload
          )
          const everhour = yield* EverhourIntegrations
          yield* everhour.bestEffortProjectSync(
            org.orgSlug,
            user.id,
            params.slug
          )
          return result
        }).pipe(dieOnMarkdown)
      )
      .handle("delete", ({ params }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          const currentOrg = yield* CurrentOrg
          const org = yield* currentOrg.resolve(params.orgSlug, user.id)
          const tags = yield* Tags
          yield* tags.remove(org.orgSlug, user.id, params.slug, params.name)
          const everhour = yield* EverhourIntegrations
          yield* everhour.bestEffortProjectSync(
            org.orgSlug,
            user.id,
            params.slug
          )
        }).pipe(dieOnMarkdown)
      )
)
