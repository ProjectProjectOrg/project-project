import { Effect, Layer, Redacted, Stream, Schema } from "effect"
import { Workflow, WorkflowEngine } from "effect/unstable/workflow"

import { OrgStorage } from "../storage/OrgStorage"
import { S3Storage, S3Unavailable } from "../storage/S3Storage"
import {
  JiraClientLive,
  JiraTransport,
  type JiraTransportRequest,
  type JiraTransportResponse
} from "./Client"
import { JiraCredentials } from "./Credentials"
import { JiraMigrationArtifactsLive } from "./MigrationArtifacts"

export const scanContext = {
  migrationId: "migration-1",
  workflowExecutionId: "execution-1",
  workflowAttempt: 1,
  scanRevision: 1,
  orgSlug: "acme",
  userId: "user-1",
  cloudId: "cloud-1",
  projectId: "10000",
  siteName: "Example",
  siteUrl: "https://example.atlassian.net",
  scannedAt: "2026-09-22T10:00:00.000Z"
}
export const scanUser = { accountId: "account-1", displayName: "Ada" }
export const scanIssue = (id: number) => ({
  id: String(id),
  key: `APP-${id}`,
  fields: {
    summary: `Issue ${id}`,
    description: "unique-raw-body-marker",
    status: { id: "s1" },
    issuetype: { id: "t1" },
    priority: { id: "p1" },
    assignee: scanUser,
    reporter: scanUser,
    labels: ["backend"],
    components: [{ id: "c1" }],
    created: "2026-01-01T00:00:00Z",
    updated: "2026-01-02T00:00:00Z"
  }
})
export const response = (
  json: unknown,
  status = 200,
  headers: Record<string, string> = {}
): JiraTransportResponse => ({
  status,
  headers,
  json: Effect.succeed(json),
  stream: Stream.empty
})
export const scanFixtureResponse = (
  request: JiraTransportRequest
): JiraTransportResponse => {
  const url = new URL(request.url)
  const path = url.pathname
  const offset = Number(url.searchParams.get("startAt") ?? 0)
  const page = (values: unknown[]) => ({
    values,
    startAt: offset,
    maxResults: 100,
    total: values.length,
    isLast: true
  })
  if (path.endsWith("/myself")) return response(scanUser)
  if (path.endsWith("/statuses"))
    return response([
      { id: "t1", name: "Task", statuses: [{ id: "s1", name: "Todo" }] }
    ])
  if (path.endsWith("/project/10000"))
    return response({
      id: "10000",
      key: "APP",
      name: "Application",
      projectTypeKey: "software"
    })
  if (path.endsWith("/field")) return response([])
  if (path.endsWith("/priority")) return response([{ id: "p1", name: "High" }])
  if (path.endsWith("/component"))
    return response(page([{ id: "c1", name: "Core" }]))
  if (path.endsWith("/version") || path.endsWith("/board"))
    return response(page([]))
  if (path.endsWith("/search/jql"))
    return response({ issues: [scanIssue(1)], isLast: true })
  if (path.endsWith("/comment")) return response({ ...page([]), comments: [] })
  if (path.endsWith("/worklog")) return response({ ...page([]), worklogs: [] })
  if (path.endsWith("/changelog")) return response(page([]))
  if (path.endsWith("/watchers"))
    return response({ watchCount: 1, watchers: [scanUser] })
  if (path.endsWith("/votes")) return response({ votes: 1, voters: [scanUser] })
  throw new Error(`Unexpected Jira request ${request.url}`)
}
export const makeScanTestLayer = (
  fetch: (
    request: JiraTransportRequest
  ) => Effect.Effect<JiraTransportResponse> = (request) =>
    Effect.succeed(scanFixtureResponse(request)),
  failPut: (key: string) => boolean = () => false
) => {
  const objects = new Map<string, Uint8Array>()
  const requests: JiraTransportRequest[] = []
  const storage = JiraMigrationArtifactsLive.pipe(
    Layer.provide(
      Layer.mergeAll(
        Layer.succeed(
          OrgStorage,
          OrgStorage.of({
            getStatus: () => Effect.die("unused"),
            connect: () => Effect.die("unused"),
            disconnect: () => Effect.die("unused"),
            requireConnection: () =>
              Effect.succeed({
                endpoint: "https://test.invalid",
                bucket: "test",
                region: "auto",
                keyPrefix: "tenant",
                forcePathStyle: true,
                accessKeyId: "test",
                secretAccessKey: "test"
              })
          })
        ),
        Layer.succeed(
          S3Storage,
          S3Storage.of({
            putObject: (_, key, _type, bytes) =>
              failPut(key)
                ? Effect.fail(
                    new S3Unavailable({
                      reason: "test storage failure",
                      retryable: true
                    })
                  )
                : Effect.sync(() => {
                    objects.set(key, bytes)
                  }),
            getObject: (_, key) => Effect.sync(() => objects.get(key) ?? null),
            listObjectKeys: (_, prefix) =>
              Effect.sync(() =>
                [...objects.keys()].filter((key) => key.startsWith(prefix))
              ),
            deleteObject: (_, key) =>
              Effect.sync(() => {
                objects.delete(key)
              }),
            presignGet: () => Effect.die("unused"),
            presignPut: () => Effect.die("unused"),
            headObject: () => Effect.die("unused"),
            checkConnection: () => Effect.die("unused")
          })
        )
      )
    )
  )
  const client = JiraClientLive.pipe(
    Layer.provide(
      Layer.mergeAll(
        Layer.succeed(
          JiraTransport,
          JiraTransport.of({
            execute: (request) =>
              Effect.suspend(() => {
                requests.push(request)
                return fetch(request)
              })
          })
        ),
        Layer.succeed(
          JiraCredentials,
          JiraCredentials.of({
            status: () => Effect.die("unused"),
            beginConnect: () => Effect.die("unused"),
            completeConnect: () => Effect.die("unused"),
            completeConnectWithReturnPath: () => Effect.die("unused"),
            returnPathForState: () => Effect.die("unused"),
            disconnect: () => Effect.die("unused"),
            accessTokenFor: () =>
              Effect.succeed({ token: Redacted.make("token") }),
            markReconnectRequired: () => Effect.void
          })
        )
      )
    )
  )
  return { objects, requests, layer: Layer.merge(client, storage) }
}

export const withScanTestWorkflow = <E, R>(
  effect: Effect.Effect<void, E, R>
) => {
  const workflow = Workflow.make("TestScanPage", {
    payload: {},
    idempotencyKey: () => "test",
    success: Schema.Void
  })
  return workflow
    .execute({})
    .pipe(
      Effect.provide(
        workflow
          .toLayer(() => effect.pipe(Effect.orDie))
          .pipe(Layer.provideMerge(WorkflowEngine.layerMemory))
      )
    )
}
