// Thin handlers for the `tickets` HttpApi group. All logic in Tickets.

import { HttpApiBuilder } from "@effect/platform"
import { AppApi, CurrentUser } from "@projectproject/shared"
import { Effect } from "effect"
import { CurrentOrg } from "../Services/CurrentOrg"
import { Tickets } from "../Services/Tickets"

const dieOnMarkdown = <A, R>(eff: Effect.Effect<A, any, R>) =>
  eff.pipe(Effect.catchTag("MarkdownError", (cause) => Effect.die(cause)))

export const TicketsHandlerLive = HttpApiBuilder.group(
  AppApi,
  "tickets",
  (handlers) =>
    handlers
      .handle("list", ({ path }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          const currentOrg = yield* CurrentOrg
          const org = yield* currentOrg.resolve(path.orgSlug, user.id)
          const tickets = yield* Tickets
          return yield* tickets.list(org.orgSlug, user.id, path.slug)
        }).pipe(dieOnMarkdown)
      )
      .handle("create", ({ path, payload }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          const currentOrg = yield* CurrentOrg
          const org = yield* currentOrg.resolve(path.orgSlug, user.id)
          const tickets = yield* Tickets
          return yield* tickets.create(org.orgSlug, user.id, path.slug, payload)
        }).pipe(dieOnMarkdown)
      )
      .handle("get", ({ path }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          const currentOrg = yield* CurrentOrg
          const org = yield* currentOrg.resolve(path.orgSlug, user.id)
          const tickets = yield* Tickets
          return yield* tickets.get(org.orgSlug, user.id, path.slug, path.id)
        }).pipe(dieOnMarkdown)
      )
      .handle("update", ({ path, payload }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          const currentOrg = yield* CurrentOrg
          const org = yield* currentOrg.resolve(path.orgSlug, user.id)
          const tickets = yield* Tickets
          return yield* tickets.update(
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
          const tickets = yield* Tickets
          yield* tickets.remove(org.orgSlug, user.id, path.slug, path.id)
        }).pipe(dieOnMarkdown)
      )
      .handle("createBranch", ({ path, payload }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          const currentOrg = yield* CurrentOrg
          const org = yield* currentOrg.resolve(path.orgSlug, user.id)
          const tickets = yield* Tickets
          return yield* tickets.createBranch(
            org.orgSlug,
            user.id,
            path.slug,
            path.id,
            payload
          )
        }).pipe(dieOnMarkdown)
      )
      .handle("openPr", ({ path, payload }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          const currentOrg = yield* CurrentOrg
          const org = yield* currentOrg.resolve(path.orgSlug, user.id)
          const tickets = yield* Tickets
          return yield* tickets.openPr(
            org.orgSlug,
            user.id,
            path.slug,
            path.id,
            payload
          )
        }).pipe(dieOnMarkdown)
      )
      .handle("clearBranch", ({ path }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          const currentOrg = yield* CurrentOrg
          const org = yield* currentOrg.resolve(path.orgSlug, user.id)
          const tickets = yield* Tickets
          return yield* tickets.clearBranch(
            org.orgSlug,
            user.id,
            path.slug,
            path.id
          )
        }).pipe(dieOnMarkdown)
      )
      .handle("attachBranch", ({ path, payload }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          const currentOrg = yield* CurrentOrg
          const org = yield* currentOrg.resolve(path.orgSlug, user.id)
          const tickets = yield* Tickets
          return yield* tickets.attachBranch(
            org.orgSlug,
            user.id,
            path.slug,
            path.id,
            payload
          )
        }).pipe(dieOnMarkdown)
      )
)
