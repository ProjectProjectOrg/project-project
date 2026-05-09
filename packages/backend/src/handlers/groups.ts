import { HttpApiBuilder } from "@effect/platform"
import { AppApi, CurrentUser } from "@projectproject/shared"
import * as Effect from "effect/Effect"
import { CurrentOrg } from "../Services/CurrentOrg"
import { Groups } from "../Services/Groups"

const dieOnMarkdown = <A, R>(eff: Effect.Effect<A, any, R>) =>
  eff.pipe(Effect.catchTag("MarkdownError", (cause) => Effect.die(cause)))

export const GroupsHandlerLive = HttpApiBuilder.group(
  AppApi,
  "groups",
  (handlers) =>
    handlers
      .handle("list", ({ path }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          const currentOrg = yield* CurrentOrg
          const org = yield* currentOrg.resolve(path.orgSlug, user.id)
          const groups = yield* Groups
          return yield* groups.list(org.orgSlug, user.id, path.slug)
        }).pipe(dieOnMarkdown)
      )
      .handle("create", ({ path, payload }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          const currentOrg = yield* CurrentOrg
          const org = yield* currentOrg.resolve(path.orgSlug, user.id)
          const groups = yield* Groups
          return yield* groups.create(org.orgSlug, user.id, path.slug, payload)
        }).pipe(dieOnMarkdown)
      )
      .handle("get", ({ path }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          const currentOrg = yield* CurrentOrg
          const org = yield* currentOrg.resolve(path.orgSlug, user.id)
          const groups = yield* Groups
          return yield* groups.get(org.orgSlug, user.id, path.slug, path.id)
        }).pipe(dieOnMarkdown)
      )
      .handle("update", ({ path, payload }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          const currentOrg = yield* CurrentOrg
          const org = yield* currentOrg.resolve(path.orgSlug, user.id)
          const groups = yield* Groups
          return yield* groups.update(
            org.orgSlug,
            user.id,
            path.slug,
            path.id,
            payload
          )
        }).pipe(dieOnMarkdown)
      )
      .handle("updateTickets", ({ path, payload }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          const currentOrg = yield* CurrentOrg
          const org = yield* currentOrg.resolve(path.orgSlug, user.id)
          const groups = yield* Groups
          return yield* groups.updateTickets(
            org.orgSlug,
            user.id,
            path.slug,
            path.id,
            payload
          )
        }).pipe(dieOnMarkdown)
      )
      .handle("delete", ({ path }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          const currentOrg = yield* CurrentOrg
          const org = yield* currentOrg.resolve(path.orgSlug, user.id)
          const groups = yield* Groups
          yield* groups.remove(org.orgSlug, user.id, path.slug, path.id)
        }).pipe(dieOnMarkdown)
      )
)
