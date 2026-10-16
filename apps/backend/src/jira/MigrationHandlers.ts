import { JiraClient, toPublicJiraError } from "@pp/server-core/jira/Client"
import { JiraMigrations } from "@pp/server-core/jira/Migrations"
import {
  JiraPlannedArchive,
  skippedAttachmentsForArchive
} from "@pp/server-core/jira/Report"
import { Markdown } from "@pp/server-core/markdown/Markdown"
import { OrgStorage } from "@pp/server-core/storage/OrgStorage"
import {
  AppApi,
  CurrentUser,
  JiraError,
  JiraMigrationUnavailable,
  JiraResourceNotFound,
  NotFound,
  OrgScope
} from "@pp/shared"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Path from "effect/Path"
import * as Schema from "effect/Schema"
import { HttpApiBuilder } from "effect/unstable/httpapi"

const context = Effect.gen(function* () {
  const user = yield* CurrentUser
  const org = yield* OrgScope
  return { user, org }
})

export const JiraMigrationsHandlerLive = HttpApiBuilder.group(
  AppApi,
  "jiraMigrations",
  (handlers) =>
    handlers
      .handle("list", () =>
        Effect.gen(function* () {
          const { user, org } = yield* context
          const migrations = yield* JiraMigrations
          return yield* migrations.list(org.organizationId, user.id)
        })
      )
      .handle("create", ({ payload }) =>
        Effect.gen(function* () {
          const { user, org } = yield* context
          const storage = yield* OrgStorage
          yield* storage.requireConnection(org.orgSlug).pipe(
            Effect.catchTags({
              StorageNotConnected: () =>
                Effect.fail(
                  new JiraMigrationUnavailable({
                    reason: "storage_unavailable"
                  })
                ),
              StorageConfigMissing: () =>
                Effect.fail(
                  new JiraMigrationUnavailable({
                    reason: "storage_unavailable"
                  })
                )
            })
          )
          const jira = yield* JiraClient
          const sites = yield* jira
            .accessibleSites(user.id)
            .pipe(Effect.mapError(toPublicJiraError))
          const site = sites.find(({ cloudId }) => cloudId === payload.cloudId)
          if (!site) return yield* new JiraResourceNotFound()
          const projects = yield* jira
            .projects(user.id, site.cloudId)
            .pipe(Effect.mapError(toPublicJiraError))
          const project = projects.find(({ id }) => id === payload.projectId)
          if (!project) return yield* new JiraResourceNotFound()
          const migrations = yield* JiraMigrations
          return yield* migrations.create(
            org.organizationId,
            user.id,
            payload.requestId,
            {
              cloudId: site.cloudId,
              siteName: site.name,
              siteUrl: site.url,
              projectId: project.id,
              projectKey: project.key,
              projectName: project.name
            }
          )
        })
      )
      .handle("get", ({ params }) =>
        Effect.gen(function* () {
          const { user, org } = yield* context
          const migrations = yield* JiraMigrations
          return yield* migrations.get(
            org.organizationId,
            user.id,
            params.migrationId
          )
        })
      )
      .handle("destinationConflicts", ({ params, query }) =>
        Effect.gen(function* () {
          const { user, org } = yield* context
          const migrations = yield* JiraMigrations
          return yield* migrations.destinationConflicts(
            org.organizationId,
            user.id,
            org.orgSlug,
            params.migrationId,
            query.expectedRevision
          )
        })
      )
      .handle("skippedAttachments", ({ params }) =>
        Effect.gen(function* () {
          const { user, org } = yield* context
          const migrations = yield* JiraMigrations
          const detail = yield* migrations.get(
            org.organizationId,
            user.id,
            params.migrationId
          )
          if (detail.status !== "succeeded") return []
          const projectSlug = detail.destinationProjectSlug
          const siteUrl = detail.scanSummary?.siteUrl
          if (
            !/^[A-Za-z0-9_-]+$/.test(detail.id) ||
            projectSlug === null ||
            siteUrl === undefined
          )
            return yield* new NotFound()
          const markdown = yield* Markdown
          const fs = yield* FileSystem.FileSystem
          const path = yield* Path.Path
          const archivePath = path.join(
            markdown.projectDir(org.orgSlug, projectSlug),
            "imports",
            "jira",
            detail.id,
            "archive.json"
          )
          const contents = yield* fs
            .readFileString(archivePath)
            .pipe(
              Effect.mapError(() => new JiraError({ reason: "server_error" }))
            )
          const archive = yield* Schema.decodeEffect(
            Schema.fromJsonString(JiraPlannedArchive)
          )(contents).pipe(
            Effect.mapError(() => new JiraError({ reason: "invalid_response" }))
          )
          if (archive.migrationId !== detail.id)
            return yield* new JiraError({ reason: "invalid_response" })
          return yield* Effect.try({
            try: () =>
              skippedAttachmentsForArchive(archive, {
                orgSlug: org.orgSlug,
                projectSlug,
                siteUrl
              }),
            catch: () => new JiraError({ reason: "invalid_response" })
          })
        })
      )
      .handle("configure", ({ params, payload }) =>
        Effect.gen(function* () {
          const { user, org } = yield* context
          const migrations = yield* JiraMigrations
          return yield* migrations.configure(
            org.organizationId,
            user.id,
            params.migrationId,
            payload.expectedRevision,
            payload.configuration
          )
        })
      )
      .handle("rescan", ({ params, payload }) =>
        Effect.gen(function* () {
          const { user, org } = yield* context
          const migrations = yield* JiraMigrations
          return yield* migrations.rescan(
            org.organizationId,
            user.id,
            params.migrationId,
            payload.expectedRevision
          )
        })
      )
      .handle("run", ({ params, payload }) =>
        Effect.gen(function* () {
          const { user, org } = yield* context
          const migrations = yield* JiraMigrations
          return yield* migrations.run(
            org.organizationId,
            user.id,
            params.migrationId,
            payload.expectedRevision
          )
        })
      )
      .handle("cancel", ({ params, payload }) =>
        Effect.gen(function* () {
          const { user, org } = yield* context
          const migrations = yield* JiraMigrations
          return yield* migrations.cancel(
            org.organizationId,
            user.id,
            params.migrationId,
            payload.expectedRevision
          )
        })
      )
      .handle("discard", ({ params }) =>
        Effect.gen(function* () {
          const { user, org } = yield* context
          const migrations = yield* JiraMigrations
          yield* migrations.discard(
            org.organizationId,
            user.id,
            params.migrationId
          )
        })
      )
)
