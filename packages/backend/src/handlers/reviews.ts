import { HttpApiBuilder } from "@effect/platform"
import { AppApi, CurrentUser } from "@projectproject/shared"
import * as Effect from "effect/Effect"
import { CurrentOrg } from "../Services/CurrentOrg"
import { Reviews } from "../Services/Reviews"
import { dieOnMarkdown } from "./lib"

export const ReviewsHandlerLive = HttpApiBuilder.group(
  AppApi,
  "reviews",
  (handlers) =>
    handlers
      .handle("get", ({ path }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          const currentOrg = yield* CurrentOrg
          const org = yield* currentOrg.resolve(path.orgSlug, user.id)
          const reviews = yield* Reviews
          return yield* reviews.get(
            org.orgSlug,
            user.id,
            path.slug,
            path.prNumber
          )
        }).pipe(dieOnMarkdown)
      )
      .handle("fileSummaries", ({ path, urlParams }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          const currentOrg = yield* CurrentOrg
          const org = yield* currentOrg.resolve(path.orgSlug, user.id)
          const reviews = yield* Reviews
          return yield* reviews.fileSummaries(
            org.orgSlug,
            user.id,
            path.slug,
            path.prNumber,
            urlParams.cursor
          )
        }).pipe(dieOnMarkdown)
      )
      .handle("files", ({ path, urlParams }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          const currentOrg = yield* CurrentOrg
          const org = yield* currentOrg.resolve(path.orgSlug, user.id)
          const reviews = yield* Reviews
          return yield* reviews.files(
            org.orgSlug,
            user.id,
            path.slug,
            path.prNumber,
            urlParams.cursor
          )
        }).pipe(dieOnMarkdown)
      )
      .handle("comments", ({ path }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          const currentOrg = yield* CurrentOrg
          const org = yield* currentOrg.resolve(path.orgSlug, user.id)
          const reviews = yield* Reviews
          return yield* reviews.comments(
            org.orgSlug,
            user.id,
            path.slug,
            path.prNumber
          )
        }).pipe(dieOnMarkdown)
      )
      .handle("submit", ({ path, payload }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          const currentOrg = yield* CurrentOrg
          const org = yield* currentOrg.resolve(path.orgSlug, user.id)
          const reviews = yield* Reviews
          return yield* reviews.submit(
            org.orgSlug,
            user.id,
            path.slug,
            path.prNumber,
            payload
          )
        }).pipe(dieOnMarkdown)
      )
      .handle("reply", ({ path, payload }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          const currentOrg = yield* CurrentOrg
          const org = yield* currentOrg.resolve(path.orgSlug, user.id)
          const reviews = yield* Reviews
          return yield* reviews.reply(
            org.orgSlug,
            user.id,
            path.slug,
            path.prNumber,
            path.commentId,
            payload
          )
        }).pipe(dieOnMarkdown)
      )
      .handle("resolveThread", ({ path }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          const currentOrg = yield* CurrentOrg
          const org = yield* currentOrg.resolve(path.orgSlug, user.id)
          const reviews = yield* Reviews
          return yield* reviews.resolveThread(
            org.orgSlug,
            user.id,
            path.slug,
            path.prNumber,
            path.threadId
          )
        }).pipe(dieOnMarkdown)
      )
      .handle("unresolveThread", ({ path }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          const currentOrg = yield* CurrentOrg
          const org = yield* currentOrg.resolve(path.orgSlug, user.id)
          const reviews = yield* Reviews
          return yield* reviews.unresolveThread(
            org.orgSlug,
            user.id,
            path.slug,
            path.prNumber,
            path.threadId
          )
        }).pipe(dieOnMarkdown)
      )
      .handle("merge", ({ path, payload }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          const currentOrg = yield* CurrentOrg
          const org = yield* currentOrg.resolve(path.orgSlug, user.id)
          const reviews = yield* Reviews
          return yield* reviews.merge(
            org.orgSlug,
            user.id,
            path.slug,
            path.prNumber,
            payload
          )
        }).pipe(dieOnMarkdown)
      )
      .handle("close", ({ path }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          const currentOrg = yield* CurrentOrg
          const org = yield* currentOrg.resolve(path.orgSlug, user.id)
          const reviews = yield* Reviews
          return yield* reviews.close(
            org.orgSlug,
            user.id,
            path.slug,
            path.prNumber
          )
        }).pipe(dieOnMarkdown)
      )
      .handle("reopen", ({ path }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          const currentOrg = yield* CurrentOrg
          const org = yield* currentOrg.resolve(path.orgSlug, user.id)
          const reviews = yield* Reviews
          return yield* reviews.reopen(
            org.orgSlug,
            user.id,
            path.slug,
            path.prNumber
          )
        }).pipe(dieOnMarkdown)
      )
)
