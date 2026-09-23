// Thin handlers for the `tickets` HttpApi group. All logic in Tickets.

import { CurrentOrg } from "@pp/server-core/organizations/CurrentOrg"
import { Tickets } from "@pp/server-core/tickets/Tickets"
import { AppApi, CurrentUser, Validation } from "@pp/shared"
import * as Effect from "effect/Effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"

import { dieOnMarkdown } from "./lib"

export const TicketsHandlerLive = HttpApiBuilder.group(
  AppApi,
  "tickets",
  (handlers) =>
    handlers
      .handle("mine", ({ params, query }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          const currentOrg = yield* CurrentOrg
          const org = yield* currentOrg.resolve(params.orgSlug, user.id)
          const tickets = yield* Tickets
          return yield* tickets.mine(org.orgSlug, user.id, query)
        })
      )
      .handle("mineByProject", ({ params }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          const currentOrg = yield* CurrentOrg
          const org = yield* currentOrg.resolve(params.orgSlug, user.id)
          const tickets = yield* Tickets
          return yield* tickets.mineByProject(org.orgSlug, user.id)
        })
      )
      .handle("recent", ({ params }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          const currentOrg = yield* CurrentOrg
          const org = yield* currentOrg.resolve(params.orgSlug, user.id)
          const tickets = yield* Tickets
          return yield* tickets.recent(org.orgSlug, user.id)
        })
      )
      .handle("sections", ({ params, query }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          const currentOrg = yield* CurrentOrg
          const org = yield* currentOrg.resolve(params.orgSlug, user.id)
          const tickets = yield* Tickets
          return yield* tickets.sections(
            org.orgSlug,
            user.id,
            params.slug,
            query
          )
        }).pipe(dieOnMarkdown)
      )
      .handle("sprintSections", ({ params, query }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          const currentOrg = yield* CurrentOrg
          const org = yield* currentOrg.resolve(params.orgSlug, user.id)
          const tickets = yield* Tickets
          return yield* tickets.sprintSections(
            org.orgSlug,
            user.id,
            params.slug,
            query
          )
        }).pipe(dieOnMarkdown)
      )
      .handle("list", ({ params, query }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          const currentOrg = yield* CurrentOrg
          const org = yield* currentOrg.resolve(params.orgSlug, user.id)
          const tickets = yield* Tickets
          return yield* tickets.list(org.orgSlug, user.id, params.slug, query)
        }).pipe(dieOnMarkdown)
      )
      .handle("search", ({ params, query }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          const currentOrg = yield* CurrentOrg
          const org = yield* currentOrg.resolve(params.orgSlug, user.id)
          const tickets = yield* Tickets
          return yield* tickets.search(org.orgSlug, user.id, params.slug, query)
        }).pipe(dieOnMarkdown)
      )
      .handle("count", ({ params, query }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          const currentOrg = yield* CurrentOrg
          const org = yield* currentOrg.resolve(params.orgSlug, user.id)
          const tickets = yield* Tickets
          return yield* tickets.count(org.orgSlug, user.id, params.slug, query)
        }).pipe(dieOnMarkdown)
      )
      .handle("quickCreate", ({ params, payload }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          const currentOrg = yield* CurrentOrg
          const org = yield* currentOrg.resolve(params.orgSlug, user.id)
          const tickets = yield* Tickets
          return yield* tickets.quickCreate(
            org.orgSlug,
            user.id,
            params.slug,
            payload
          )
        }).pipe(dieOnMarkdown)
      )
      .handle("create", ({ params, payload }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          const currentOrg = yield* CurrentOrg
          const org = yield* currentOrg.resolve(params.orgSlug, user.id)
          const tickets = yield* Tickets
          return yield* tickets.create(
            org.orgSlug,
            user.id,
            params.slug,
            payload
          )
        }).pipe(dieOnMarkdown)
      )
      .handle("get", ({ params }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          const currentOrg = yield* CurrentOrg
          const org = yield* currentOrg.resolve(params.orgSlug, user.id)
          const tickets = yield* Tickets
          return yield* tickets.get(
            org.orgSlug,
            user.id,
            params.slug,
            params.id
          )
        }).pipe(dieOnMarkdown)
      )
      .handle("update", ({ params, payload, query }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          const currentOrg = yield* CurrentOrg
          const org = yield* currentOrg.resolve(params.orgSlug, user.id)
          const tickets = yield* Tickets
          return yield* tickets.update(
            org.orgSlug,
            user.id,
            params.slug,
            params.id,
            payload,
            query.sort
          )
        }).pipe(dieOnMarkdown)
      )
      .handle("delete", ({ params }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          const currentOrg = yield* CurrentOrg
          const org = yield* currentOrg.resolve(params.orgSlug, user.id)
          const tickets = yield* Tickets
          yield* tickets.remove(org.orgSlug, user.id, params.slug, params.id)
        }).pipe(dieOnMarkdown)
      )
      .handle("split", ({ params, payload }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          const currentOrg = yield* CurrentOrg
          const org = yield* currentOrg.resolve(params.orgSlug, user.id)
          const tickets = yield* Tickets
          return yield* tickets.split(
            org.orgSlug,
            user.id,
            params.slug,
            params.id,
            payload
          )
        }).pipe(dieOnMarkdown)
      )
      .handle("archive", ({ params, payload }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          const currentOrg = yield* CurrentOrg
          const org = yield* currentOrg.resolve(params.orgSlug, user.id)
          const tickets = yield* Tickets
          return yield* tickets.archive(
            org.orgSlug,
            user.id,
            params.slug,
            params.id,
            payload.reason
          )
        }).pipe(
          Effect.catchTag("InvalidCommentBody", (error) =>
            Effect.fail(new Validation({ reason: error.reason }))
          ),
          dieOnMarkdown
        )
      )
      .handle("unarchive", ({ params }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          const currentOrg = yield* CurrentOrg
          const org = yield* currentOrg.resolve(params.orgSlug, user.id)
          const tickets = yield* Tickets
          return yield* tickets.unarchive(
            org.orgSlug,
            user.id,
            params.slug,
            params.id
          )
        }).pipe(dieOnMarkdown)
      )
      .handle("createBranch", ({ params, payload }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          const currentOrg = yield* CurrentOrg
          const org = yield* currentOrg.resolve(params.orgSlug, user.id)
          const tickets = yield* Tickets
          return yield* tickets.createBranch(
            org.orgSlug,
            user.id,
            params.slug,
            params.id,
            payload
          )
        }).pipe(dieOnMarkdown)
      )
      .handle("openPr", ({ params, payload }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          const currentOrg = yield* CurrentOrg
          const org = yield* currentOrg.resolve(params.orgSlug, user.id)
          const tickets = yield* Tickets
          return yield* tickets.openPr(
            org.orgSlug,
            user.id,
            params.slug,
            params.id,
            payload
          )
        }).pipe(dieOnMarkdown)
      )
      .handle("clearBranch", ({ params }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          const currentOrg = yield* CurrentOrg
          const org = yield* currentOrg.resolve(params.orgSlug, user.id)
          const tickets = yield* Tickets
          return yield* tickets.clearBranch(
            org.orgSlug,
            user.id,
            params.slug,
            params.id
          )
        }).pipe(dieOnMarkdown)
      )
      .handle("attachBranch", ({ params, payload }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          const currentOrg = yield* CurrentOrg
          const org = yield* currentOrg.resolve(params.orgSlug, user.id)
          const tickets = yield* Tickets
          return yield* tickets.attachBranch(
            org.orgSlug,
            user.id,
            params.slug,
            params.id,
            payload
          )
        }).pipe(dieOnMarkdown)
      )
)
