// Thin handlers for the `tickets` HttpApi group. All logic in Tickets.

import { HttpApiBuilder } from "@effect/platform"
import {
  AppApi,
  CurrentUser,
  ticketListQueryFromSearch
} from "@projectproject/shared"
import * as Effect from "effect/Effect"
import { CurrentOrg } from "../Services/CurrentOrg"
import { Tickets } from "../Services/Tickets"
import { dieOnMarkdown } from "./lib"

export const TicketsHandlerLive = HttpApiBuilder.group(
  AppApi,
  "tickets",
  (handlers) =>
    handlers
      .handle("list", ({ path, urlParams }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          const currentOrg = yield* CurrentOrg
          const org = yield* currentOrg.resolve(path.orgSlug, user.id)
          const tickets = yield* Tickets
          return yield* tickets.list(
            org.orgSlug,
            user.id,
            path.slug,
            ticketListQueryFromSearch(urlParams)
          )
        }).pipe(dieOnMarkdown)
      )
      .handle("search", ({ path, urlParams }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          const currentOrg = yield* CurrentOrg
          const org = yield* currentOrg.resolve(path.orgSlug, user.id)
          const tickets = yield* Tickets
          const limitNum =
            urlParams.limit !== undefined
              ? Number.parseInt(urlParams.limit, 10)
              : undefined
          return yield* tickets.search(org.orgSlug, user.id, path.slug, {
            q: urlParams.q,
            excludeGroupId: urlParams.excludeGroupId,
            limit:
              limitNum !== undefined && Number.isFinite(limitNum)
                ? limitNum
                : undefined
          })
        }).pipe(dieOnMarkdown)
      )
      .handle("count", ({ path, urlParams }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          const currentOrg = yield* CurrentOrg
          const org = yield* currentOrg.resolve(path.orgSlug, user.id)
          const tickets = yield* Tickets
          return yield* tickets.count(
            org.orgSlug,
            user.id,
            path.slug,
            ticketListQueryFromSearch(urlParams)
          )
        }).pipe(dieOnMarkdown)
      )
      .handle("quickCreate", ({ path, payload }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          const currentOrg = yield* CurrentOrg
          const org = yield* currentOrg.resolve(path.orgSlug, user.id)
          const tickets = yield* Tickets
          return yield* tickets.quickCreate(
            org.orgSlug,
            user.id,
            path.slug,
            payload
          )
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
