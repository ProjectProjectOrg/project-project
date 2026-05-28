import { HttpApiBuilder } from "@effect/platform"
import { AppApi, CurrentUser } from "@projectproject/shared"
import * as Effect from "effect/Effect"
import { CurrentOrg } from "../Services/CurrentOrg"
import { ProjectStatuses } from "../Services/ProjectStatuses"
import { dieOnMarkdown } from "./lib"

export const StatusesHandlerLive = HttpApiBuilder.group(
  AppApi,
  "statuses",
  (handlers) =>
    handlers
      .handle("list", ({ path }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          const currentOrg = yield* CurrentOrg
          const org = yield* currentOrg.resolve(path.orgSlug, user.id)
          const svc = yield* ProjectStatuses
          return yield* svc.list(org.orgSlug, user.id, path.slug)
        })
      )
      .handle("create", ({ path, payload }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          const currentOrg = yield* CurrentOrg
          const org = yield* currentOrg.resolve(path.orgSlug, user.id)
          const svc = yield* ProjectStatuses
          return yield* svc.create(org.orgSlug, user.id, path.slug, payload)
        })
      )
      .handle("update", ({ path, payload }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          const currentOrg = yield* CurrentOrg
          const org = yield* currentOrg.resolve(path.orgSlug, user.id)
          const svc = yield* ProjectStatuses
          return yield* svc
            .update(org.orgSlug, user.id, path.slug, path.statusSlug, payload)
            .pipe(dieOnMarkdown)
        })
      )
      .handle("reorder", ({ path, payload }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          const currentOrg = yield* CurrentOrg
          const org = yield* currentOrg.resolve(path.orgSlug, user.id)
          const svc = yield* ProjectStatuses
          return yield* svc.reorder(
            org.orgSlug,
            user.id,
            path.slug,
            path.statusSlug,
            payload
          )
        })
      )
      .handle("remove", ({ path, urlParams }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          const currentOrg = yield* CurrentOrg
          const org = yield* currentOrg.resolve(path.orgSlug, user.id)
          const svc = yield* ProjectStatuses
          return yield* svc
            .remove(org.orgSlug, user.id, path.slug, path.statusSlug, {
              reassignTo: urlParams.reassignTo
            })
            .pipe(dieOnMarkdown)
        })
      )
)
