import { it } from "@effect/vitest"
import { expect } from "vite-plus/test"
import {
  AppApi,
  Authentication,
  Conflict,
  CurrentUser,
  type User
} from "@projectproject/shared"
import { DateTime, Effect, Layer, Stream } from "effect"
import { HttpRouter, HttpServer } from "effect/unstable/http"
import { HttpApiTest } from "effect/unstable/httpapi"
import { CurrentOrg } from "../Services/CurrentOrg"
import { OrgStorage } from "../Services/OrgStorage"
import { JiraClient } from "./Client"
import { JiraMigrationsHandlerLive } from "./MigrationHandlers"
import { JiraMigrations } from "./Migrations"

const unused = () => Effect.die("Unexpected dependency call")
const user: User = {
  id: "user-1",
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
const dependencies = Layer.mergeAll(
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
  Layer.succeed(JiraClient)({
    accessibleSites: (userId) => {
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
