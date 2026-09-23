import * as BunFileSystem from "@effect/platform-bun/BunFileSystem"
import * as BunPath from "@effect/platform-bun/BunPath"
import { it } from "@effect/vitest"
import {
  JiraRateLimited,
  JiraTransientFailure
} from "@pp/server-core/jira/Blocked"
import {
  JiraClient,
  JiraClientLive,
  JiraTransportLive,
  type JiraCallError
} from "@pp/server-core/jira/Client"
import { JiraCredentials } from "@pp/server-core/jira/Credentials"
import { JiraMigrations } from "@pp/server-core/jira/Migrations"
import { Markdown, type MarkdownShape } from "@pp/server-core/markdown/Markdown"
import { CurrentOrg } from "@pp/server-core/organizations/CurrentOrg"
import { OrgStorage } from "@pp/server-core/storage/OrgStorage"
import {
  AppApi,
  Authentication,
  Conflict,
  CurrentUser,
  JiraMigrationConfiguration,
  type JiraMigrationDetail,
  NotFound,
  UserId,
  type User
} from "@pp/shared"
import {
  DateTime,
  Effect,
  FileSystem,
  Layer,
  Path,
  Redacted,
  Schema,
  Stream
} from "effect"
import { FetchHttpClient, HttpRouter, HttpServer } from "effect/unstable/http"
import { HttpApiTest } from "effect/unstable/httpapi"
import { expect } from "vitest"

import { JiraHandlerLive } from "./Handlers"
import { JiraMigrationsHandlerLive } from "./MigrationHandlers"

const unused = () => Effect.die("Unexpected dependency call")
const user: User = {
  id: Schema.decodeUnknownSync(UserId)("user-1"),
  name: "User",
  email: "user@example.test",
  username: null,
  image: null,
  createdAt: DateTime.toDate(DateTime.makeUnsafe("2026-09-22T00:00:00Z")),
  activeOrgSlug: "organization",
  personalGithub: { connected: false },
  editorPreference: "vscode",
  personalEverhour: {
    connected: false,
    everhourUserId: null,
    name: null,
    email: null,
    lastVerifiedAt: null,
    lastCheckError: null
  }
}
const authentication = Layer.succeed(Authentication)({
  sessionCookie: (effect) => Effect.provideService(effect, CurrentUser, user)
})
const dependenciesFor = (
  failure?: JiraCallError,
  failureAt: "sites" | "projects" = "sites",
  clientLayer?: Layer.Layer<JiraClient>,
  root = "."
) =>
  Layer.mergeAll(
    BunFileSystem.layer,
    BunPath.layer,
    Layer.succeed(Markdown)({
      projectDir: () => root
    } as unknown as MarkdownShape),
    Layer.succeed(JiraCredentials)({
      status: unused,
      beginConnect: unused,
      completeConnect: unused,
      completeConnectWithReturnPath: unused,
      returnPathForState: unused,
      accessTokenFor: unused,
      disconnect: unused,
      markReconnectRequired: unused
    }),
    Layer.succeed(CurrentOrg)({
      resolve: (orgSlug, userId) => {
        expect([orgSlug, userId]).toEqual(["organization", "user-1"])
        return Effect.succeed({
          organizationId: "org-1",
          orgSlug,
          role: "admin" as const
        })
      }
    }),
    Layer.succeed(OrgStorage)({
      getStatus: unused,
      connect: unused,
      disconnect: unused,
      requireConnection: () =>
        Effect.succeed({
          endpoint: "http://127.0.0.1:9000",
          bucket: "test",
          region: "test",
          keyPrefix: null,
          forcePathStyle: true,
          accessKeyId: "test",
          secretAccessKey: "test"
        })
    }),
    clientLayer ??
      Layer.succeed(JiraClient)({
        snapshots: {
          currentUser: () => Effect.die("unused"),
          project: () => Effect.die("unused"),
          projectStatuses: () => Effect.die("unused"),
          fields: () => Effect.die("unused"),
          priorities: () => Effect.die("unused"),
          watchers: () => Effect.die("unused"),
          votes: () => Effect.die("unused"),
          boardConfiguration: () => Effect.die("unused")
        },
        accessibleSites: (userId) => {
          if (failure && failureAt === "sites") return Effect.fail(failure)
          expect(userId).toBe("user-1")
          return Effect.succeed([
            {
              cloudId: "cloud-1",
              name: "Example",
              url: "https://example.atlassian.net",
              avatarUrl: null
            }
          ])
        },
        projects: (userId, cloudId) => {
          if (failure && failureAt === "projects") return Effect.fail(failure)
          expect([userId, cloudId]).toEqual(["user-1", "cloud-1"])
          return Effect.succeed([
            {
              id: "10000",
              key: "APP",
              name: "Application",
              projectTypeKey: null,
              simplified: null,
              style: null,
              avatarUrl: null
            }
          ])
        },
        searchIssuesPage: unused,
        commentsPage: unused,
        worklogsPage: unused,
        changelogsPage: unused,
        componentsPage: unused,
        versionsPage: unused,
        boardsPage: unused,
        sprintsPage: unused,
        sprintIssuesPage: unused,
        currentUser: unused,
        project: unused,
        projectStatuses: unused,
        fields: unused,
        priorities: unused,
        components: unused,
        versions: unused,
        searchIssues: unused,
        comments: unused,
        worklogs: unused,
        changelogs: unused,
        watchers: unused,
        votes: unused,
        boards: unused,
        boardConfiguration: unused,
        sprints: unused,
        sprintIssues: unused,
        attachmentContent: () => Stream.die("unused")
      })
  )

const dependencies = dependenciesFor()

it.effect(
  "serves skipped attachment links only for an owned completed migration",
  () =>
    Effect.scoped(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem
        const path = yield* Path.Path
        const root = yield* fs.makeTempDirectoryScoped({
          prefix: "jira-skipped-links-"
        })
        const archiveDir = path.join(root, "imports", "jira", "migration-1")
        yield* fs.makeDirectory(archiveDir, { recursive: true })
        const archiveJson = yield* Schema.encodeEffect(
          Schema.fromJsonString(Schema.Unknown)
        )({
          version: 1,
          manifestVersion: 2,
          migrationId: "migration-1",
          source: {},
          restrictionPolicy: "include",
          categories: {
            issues: [{ id: "issue-1", key: "APP-1" }],
            attachments: [
              {
                id: "attachment-1",
                issueId: "issue-1",
                filename: "notes.txt",
                mimeType: "text/plain",
                byteSize: 25
              }
            ]
          },
          exclusions: [],
          mappings: {},
          attachmentOutcomes: [
            { kind: "skipped", sourceAttachmentId: "attachment-1" }
          ],
          schemaVersions: [],
          converterVersions: []
        })
        yield* fs.writeFileString(
          path.join(archiveDir, "archive.json"),
          archiveJson
        )
        const now = DateTime.makeUnsafe("2026-09-22T00:00:00Z")
        const detail = {
          id: "migration-1",
          sourceCloudId: "cloud-1",
          sourceProjectId: "10000",
          sourceProjectKey: "APP",
          sourceProjectName: "Application",
          status: "succeeded",
          phase: "succeeded",
          revision: 3,
          progress: { phase: "succeeded", done: 1, total: 1 },
          destinationProjectSlug: "application",
          createdAt: now,
          updatedAt: now,
          scanSummary: {
            siteName: "Example",
            siteUrl: "https://example.atlassian.net",
            projectName: "Application",
            projectKey: "APP",
            scannedAt: now,
            counts: {
              identities: 0,
              statuses: 0,
              issueTypes: 0,
              priorities: 0,
              tags: 0,
              issues: 1,
              comments: 0,
              attachments: 1,
              groups: 0,
              restrictions: 0
            },
            visibilityWarnings: []
          },
          requirements: null,
          configuration: null,
          failedAttachmentIds: [],
          actions: {
            canConfigure: false,
            canRun: false,
            canRescan: false,
            canCancel: false,
            canRetry: false,
            canDiscard: false
          },
          failure: null,
          reportPath: "imports/jira/migration-1/report.md",
          finishedAt: now
        } satisfies JiraMigrationDetail
        const services = Layer.mergeAll(
          dependenciesFor(undefined, "sites", undefined, root),
          Layer.succeed(JiraMigrations)({
            list: unused,
            create: unused,
            configure: unused,
            rescan: unused,
            run: unused,
            cancel: unused,
            discard: unused,
            destinationConflicts: unused,
            get: (_orgId, _userId, migrationId) =>
              migrationId === "migration-1"
                ? Effect.succeed(detail)
                : Effect.fail(new NotFound())
          })
        )
        const handlers = JiraMigrationsHandlerLive.pipe(
          Layer.provide(services),
          HttpRouter.provideRequest(services),
          Layer.provideMerge(authentication)
        )
        yield* Effect.gen(function* () {
          const client = yield* HttpApiTest.groups(AppApi, ["jiraMigrations"])
          const skipped = yield* client.jiraMigrations.skippedAttachments({
            params: { orgSlug: "organization", migrationId: "migration-1" }
          })
          expect(skipped).toEqual([
            {
              sourceAttachmentId: "attachment-1",
              filename: "notes.txt",
              sourceIssueKey: "APP-1",
              targetTicketId: "APP-1",
              sourceIssueUrl: "https://example.atlassian.net/browse/APP-1",
              targetTicketUrl:
                "/orgs/organization/projects/application/tickets/APP-1",
              replacement: "available"
            }
          ])
          const missing = yield* Effect.result(
            client.jiraMigrations.skippedAttachments({
              params: { orgSlug: "organization", migrationId: "another" }
            })
          )
          expect(missing).toMatchObject({
            _tag: "Failure",
            failure: { _tag: "NotFound" }
          })
        }).pipe(
          Effect.provide(Layer.mergeAll(handlers, HttpServer.layerServices))
        )
      })
    ).pipe(Effect.provide(Layer.mergeAll(BunFileSystem.layer, BunPath.layer)))
)

it.effect(
  "shows destination conflicts for the authenticated migration revision",
  () =>
    Effect.gen(function* () {
      const services = Layer.mergeAll(
        dependenciesFor(),
        Layer.succeed(JiraMigrations)({
          list: unused,
          get: unused,
          create: unused,
          configure: unused,
          rescan: unused,
          run: unused,
          cancel: unused,
          discard: unused,
          destinationConflicts: (
            organizationId,
            userId,
            orgSlug,
            migrationId,
            expectedRevision
          ) => {
            expect({
              organizationId,
              userId,
              orgSlug,
              migrationId,
              expectedRevision
            }).toEqual({
              organizationId: "org-1",
              userId: "user-1",
              orgSlug: "organization",
              migrationId: "migration-1",
              expectedRevision: 14
            })
            return Effect.succeed([
              { kind: "project_key" as const, value: "APP" },
              { kind: "ticket_id" as const, value: "APP-1" }
            ])
          }
        })
      )
      const handlers = JiraMigrationsHandlerLive.pipe(
        Layer.provide(services),
        HttpRouter.provideRequest(services),
        Layer.provideMerge(authentication)
      )
      yield* Effect.gen(function* () {
        const client = yield* HttpApiTest.groups(AppApi, ["jiraMigrations"])
        const conflicts = yield* client.jiraMigrations.destinationConflicts({
          params: { orgSlug: "organization", migrationId: "migration-1" },
          query: { expectedRevision: 14 }
        })
        expect(conflicts).toEqual([
          { kind: "project_key", value: "APP" },
          { kind: "ticket_id", value: "APP-1" }
        ])
      }).pipe(
        Effect.provide(Layer.mergeAll(handlers, HttpServer.layerServices))
      )
    })
)

it.effect(
  "resolves the authenticated source and keeps detail and Conflict HTTP contracts",
  () =>
    Effect.gen(function* () {
      const now = DateTime.makeUnsafe("2026-09-22T00:00:00Z")
      const migrations = Layer.succeed(JiraMigrations)({
        list: unused,
        get: unused,
        configure: unused,
        rescan: unused,
        run: unused,
        cancel: unused,
        discard: unused,
        destinationConflicts: unused,
        create: (organizationId, userId, requestId, source) => {
          expect([organizationId, userId]).toEqual(["org-1", "user-1"])
          expect(source).toEqual({
            cloudId: "cloud-1",
            siteName: "Example",
            siteUrl: "https://example.atlassian.net",
            projectId: "10000",
            projectKey: "APP",
            projectName: "Application"
          })
          if (requestId === "reused")
            return Effect.fail(
              new Conflict({ reason: "jira_migration_request_conflict" })
            )
          return Effect.succeed({
            id: "workflow-execution-id",
            sourceCloudId: source.cloudId,
            sourceProjectId: source.projectId,
            sourceProjectKey: source.projectKey,
            sourceProjectName: source.projectName,
            status: "scanning" as const,
            phase: "queued_scan",
            revision: 0,
            progress: { phase: "queued_scan", done: 0, total: null },
            destinationProjectSlug: null,
            createdAt: now,
            updatedAt: now,
            scanSummary: null,
            requirements: null,
            configuration: null,
            failedAttachmentIds: [],
            actions: {
              canConfigure: false,
              canRun: false,
              canRescan: false,
              canCancel: true,
              canRetry: false,
              canDiscard: false
            },
            failure: null,
            reportPath: null,
            finishedAt: null
          })
        }
      })
      const handlers = JiraMigrationsHandlerLive.pipe(
        Layer.provide(Layer.mergeAll(dependencies, migrations)),
        HttpRouter.provideRequest(Layer.mergeAll(dependencies, migrations)),
        Layer.provideMerge(authentication)
      )
      yield* Effect.gen(function* () {
        const client = yield* HttpApiTest.groups(AppApi, ["jiraMigrations"])
        const detail = yield* client.jiraMigrations.create({
          params: { orgSlug: "organization" },
          payload: { requestId: "new", cloudId: "cloud-1", projectId: "10000" }
        })
        expect(detail).toMatchObject({
          id: "workflow-execution-id",
          status: "scanning",
          actions: { canCancel: true }
        })
        expect(DateTime.isUtc(detail.createdAt)).toBe(true)
        const conflict = yield* Effect.result(
          client.jiraMigrations.create({
            params: { orgSlug: "organization" },
            payload: {
              requestId: "reused",
              cloudId: "cloud-1",
              projectId: "10000"
            }
          })
        )
        expect(conflict).toMatchObject({
          _tag: "Failure",
          failure: {
            _tag: "Conflict",
            reason: "jira_migration_request_conflict"
          }
        })
      }).pipe(
        Effect.provide(Layer.mergeAll(handlers, HttpServer.layerServices))
      )
    })
)

for (const failureAt of ["sites", "projects"] as const) {
  for (const [failure, expected] of [
    [
      new JiraRateLimited({ operation: "projects", retryAfterMillis: 15000 }),
      { _tag: "JiraRateLimited", retryAfterSeconds: 15 }
    ],
    [
      new JiraTransientFailure({ operation: "projects", reason: "network" }),
      { _tag: "JiraError", reason: "network" }
    ],
    [
      new JiraTransientFailure({
        operation: "projects",
        reason: "invalid_retry_after"
      }),
      { _tag: "JiraError", reason: "invalid_response" }
    ]
  ] as const) {
    it.effect(
      `preserves public ${failure._tag} from ${failureAt} in selection and migration routes`,
      () =>
        Effect.gen(function* () {
          const dependencies = Layer.mergeAll(
            dependenciesFor(failure, failureAt),
            Layer.succeed(JiraMigrations)({
              list: unused,
              get: unused,
              create: unused,
              configure: unused,
              rescan: unused,
              run: unused,
              cancel: unused,
              discard: unused,
              destinationConflicts: unused
            })
          )
          const handlers = Layer.mergeAll(
            JiraHandlerLive,
            JiraMigrationsHandlerLive
          ).pipe(
            Layer.provide(dependencies),
            HttpRouter.provideRequest(dependencies),
            Layer.provideMerge(authentication)
          )
          yield* Effect.gen(function* () {
            const client = yield* HttpApiTest.groups(AppApi, [
              "jira",
              "jiraMigrations"
            ])
            const selected = yield* Effect.result(
              failureAt === "sites"
                ? client.jira.sites().pipe(Effect.asVoid)
                : client.jira
                    .projects({ params: { cloudId: "cloud-1" } })
                    .pipe(Effect.asVoid)
            )
            expect(selected).toMatchObject({
              _tag: "Failure",
              failure: expected
            })
            if (selected._tag === "Failure") {
              expect(selected.failure).not.toHaveProperty("operation")
              expect(selected.failure).not.toHaveProperty("retryAfterMillis")
            }
            const created = yield* Effect.result(
              client.jiraMigrations.create({
                params: { orgSlug: "organization" },
                payload: {
                  requestId: "new",
                  cloudId: "cloud-1",
                  projectId: "10000"
                }
              })
            )
            expect(created).toMatchObject({
              _tag: "Failure",
              failure: expected
            })
            if (created._tag === "Failure") {
              expect(created.failure).not.toHaveProperty("operation")
              expect(created.failure).not.toHaveProperty("retryAfterMillis")
            }
          }).pipe(
            Effect.provide(Layer.mergeAll(handlers, HttpServer.layerServices))
          )
        })
    )
  }
}

for (const kind of ["body reset", "malformed JSON"] as const) {
  it.effect(
    `preserves public error classification for live ${kind} responses`,
    () =>
      Effect.gen(function* () {
        let requests = 0
        const fetch = Layer.succeed(
          FetchHttpClient.Fetch,
          Object.assign(
            async () => {
              requests += 1
              const body =
                kind === "body reset"
                  ? new ReadableStream<Uint8Array>({
                      start(controller) {
                        controller.enqueue(new TextEncoder().encode("["))
                        controller.error(
                          new TypeError("socket reset during body read")
                        )
                      }
                    })
                  : "{"
              return new Response(body, {
                status: 200,
                headers: { "content-type": "application/json" }
              })
            },
            { preconnect: () => undefined }
          )
        )
        const jira = JiraClientLive.pipe(
          Layer.provide(
            Layer.mergeAll(
              JiraTransportLive.pipe(Layer.provide(FetchHttpClient.layer)),
              Layer.succeed(JiraCredentials)({
                status: unused,
                beginConnect: unused,
                completeConnect: unused,
                completeConnectWithReturnPath: unused,
                returnPathForState: unused,
                accessTokenFor: () =>
                  Effect.succeed({ token: Redacted.make("token") }),
                disconnect: unused,
                markReconnectRequired: unused
              })
            )
          ),
          Layer.provideMerge(fetch)
        )
        const dependencies = Layer.mergeAll(
          dependenciesFor(undefined, "sites", jira),
          fetch,
          Layer.succeed(JiraMigrations)({
            list: unused,
            get: unused,
            create: unused,
            configure: unused,
            rescan: unused,
            run: unused,
            cancel: unused,
            discard: unused,
            destinationConflicts: unused
          })
        )
        const handlers = Layer.mergeAll(
          JiraHandlerLive,
          JiraMigrationsHandlerLive
        ).pipe(
          Layer.provide(dependencies),
          HttpRouter.provideRequest(dependencies),
          Layer.provideMerge(authentication)
        )
        yield* Effect.gen(function* () {
          const client = yield* HttpApiTest.groups(AppApi, [
            "jira",
            "jiraMigrations"
          ])
          const selected = yield* Effect.result(client.jira.sites())
          const created = yield* Effect.result(
            client.jiraMigrations.create({
              params: { orgSlug: "organization" },
              payload: {
                requestId: "body-failure",
                cloudId: "cloud-1",
                projectId: "10000"
              }
            })
          )
          for (const result of [selected, created]) {
            expect(result).toMatchObject({
              _tag: "Failure",
              failure: {
                _tag: "JiraError",
                reason: kind === "body reset" ? "network" : "invalid_response"
              }
            })
            if (result._tag === "Failure")
              expect(result.failure).not.toHaveProperty("operation")
          }
          expect(requests).toBe(2)
        }).pipe(
          Effect.provide(Layer.mergeAll(handlers, HttpServer.layerServices))
        )
      })
  )
}

it.effect(
  "preserves whole incomplete configuration and expected revision at the authorized command boundary",
  () =>
    Effect.gen(function* () {
      const configuration = yield* Schema.decodeUnknownEffect(
        JiraMigrationConfiguration
      )({
        destination: { name: "Application", slug: "application", key: "APP" },
        identities: [],
        statuses: [],
        issueTypes: [],
        priorities: [],
        tags: [],
        activeFutureSprintChoices: [],
        restrictedContent: { policy: "exclude" as const },
        skippedAttachmentIds: [],
        attachmentSkipsAccepted: false
      })
      const dependencies = Layer.mergeAll(
        dependenciesFor(),
        Layer.succeed(JiraMigrations)({
          list: unused,
          get: unused,
          create: unused,
          run: unused,
          rescan: unused,
          cancel: unused,
          discard: unused,
          destinationConflicts: unused,
          configure: (
            organizationId,
            userId,
            migrationId,
            expectedRevision,
            draft
          ) => {
            expect({
              organizationId,
              userId,
              migrationId,
              expectedRevision,
              draft
            }).toEqual({
              organizationId: "org-1",
              userId: "user-1",
              migrationId: "draft-1",
              expectedRevision: 7,
              draft: configuration
            })
            return Effect.fail(
              new Conflict({ reason: "jira_migration_revision_conflict" })
            )
          }
        })
      )
      const handlers = JiraMigrationsHandlerLive.pipe(
        Layer.provide(dependencies),
        HttpRouter.provideRequest(dependencies),
        Layer.provideMerge(authentication)
      )
      yield* Effect.gen(function* () {
        const client = yield* HttpApiTest.groups(AppApi, ["jiraMigrations"])
        const result = yield* Effect.result(
          client.jiraMigrations.configure({
            params: { orgSlug: "organization", migrationId: "draft-1" },
            payload: { expectedRevision: 7, configuration }
          })
        )
        expect(result).toMatchObject({
          _tag: "Failure",
          failure: {
            _tag: "Conflict",
            reason: "jira_migration_revision_conflict"
          }
        })
      }).pipe(
        Effect.provide(Layer.mergeAll(handlers, HttpServer.layerServices))
      )
    })
)
