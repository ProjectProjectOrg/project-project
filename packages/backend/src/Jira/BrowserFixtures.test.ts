import { it } from "@effect/vitest"
import { describe, expect } from "vite-plus/test"
import { DateTime, Effect, Fiber, Layer, Redacted, Stream } from "effect"
import { JiraCredentials } from "./Credentials"
import { JiraClient, JiraClientLive, JiraTransport } from "./Client"
import {
  JiraBrowserScenario,
  createJiraBrowserFixture
} from "./BrowserFixtures"

const fixtureClient = Effect.fn("fixtureClient")(function* (
  scenario: JiraBrowserScenario
) {
  const fixture = yield* createJiraBrowserFixture(scenario)
  const credentials = JiraCredentials.of({
    status: () => Effect.die("unused"),
    beginConnect: () => Effect.die("unused"),
    completeConnect: () => Effect.die("unused"),
    completeConnectWithReturnPath: () => Effect.die("unused"),
    returnPathForState: () => Effect.die("unused"),
    disconnect: () => Effect.die("unused"),
    accessTokenFor: () =>
      Effect.succeed({ token: Redacted.make("fixture-access-token") }),
    markReconnectRequired: () => Effect.void
  })
  const layer = JiraClientLive.pipe(
    Layer.provide(
      Layer.mergeAll(
        Layer.succeed(JiraTransport, fixture.transport),
        Layer.succeed(JiraCredentials, credentials)
      )
    )
  )
  const client = yield* JiraClient.pipe(Effect.provide(layer))
  return { client, fixture }
})

describe("Jira browser fixtures", () => {
  it.effect(
    "exposes every manifest-v2 source category and stable source metadata",
    () =>
      Effect.gen(function* () {
        const fixture = yield* createJiraBrowserFixture("happy_path")

        expect(JiraBrowserScenario.literals).toEqual([
          "happy_path",
          "rate_limited_once",
          "reconnect_once",
          "pause_attachment"
        ])
        expect(fixture.categories).toEqual(
          expect.arrayContaining([
            "fieldDefinitions",
            "workflows",
            "identities",
            "statuses",
            "issueTypes",
            "priorities",
            "components",
            "issues",
            "comments",
            "changelogs",
            "worklogs",
            "watchers",
            "votes",
            "attachments",
            "parentsSubtasks",
            "epics",
            "sprints",
            "versionsReleases",
            "ranks",
            "links",
            "restrictions",
            "productApps",
            "customFields"
          ])
        )
        expect(fixture.source).toEqual({
          cloudId: "fixture-cloud-1",
          siteUrl: "https://fixture.atlassian.net",
          projectId: "10000",
          projectKey: "APP",
          projectName: "Fixture Application",
          scannedAt: "2026-09-22T10:00:00.000Z",
          visibleAccount: {
            accountId: "fixture-account-1",
            displayName: "Ada Fixture",
            caveat: "Only content visible to Ada Fixture is included."
          }
        })
      })
  )

  it.effect(
    "decodes paginated issues and dependent collections through the real client",
    () =>
      Effect.gen(function* () {
        const { client, fixture } = yield* fixtureClient("happy_path")
        const issues = yield* client.searchIssues(
          "fixture-user-1",
          "fixture-cloud-1",
          {
            jql: "project = APP ORDER BY key ASC",
            fields: ["summary"]
          }
        )
        const comments = yield* client.comments(
          "fixture-user-1",
          "fixture-cloud-1",
          "APP-1"
        )
        const worklogs = yield* client.worklogs(
          "fixture-user-1",
          "fixture-cloud-1",
          "APP-1"
        )
        const changelogs = yield* client.changelogs(
          "fixture-user-1",
          "fixture-cloud-1",
          "APP-1"
        )
        const secondIssueComments = yield* client.comments(
          "fixture-user-1",
          "fixture-cloud-1",
          "APP-2"
        )

        expect(issues.map(({ key }) => key)).toEqual(["APP-1", "APP-2"])
        expect(issues[0]?.fields.attachment).toMatchObject([
          { id: "attachment-1", mimeType: "text/plain" },
          { id: "attachment-2", mimeType: "image/png" }
        ])
        expect(comments.map(({ id }) => id)).toEqual(["comment-1", "comment-2"])
        expect(worklogs.map(({ id }) => id)).toEqual(["worklog-1", "worklog-2"])
        expect(changelogs.map(({ id }) => id)).toEqual([
          "changelog-1",
          "changelog-2"
        ])
        expect(secondIssueComments).toEqual([])
        expect(
          (yield* fixture.calls).map(({ operation, page }) => [operation, page])
        ).toEqual([
          ["issues", "first"],
          ["issues", "issues-2"],
          ["comments", "APP-1:0"],
          ["comments", "APP-1:100"],
          ["worklogs", "APP-1:0"],
          ["worklogs", "APP-1:100"],
          ["changelogs", "APP-1:0"],
          ["changelogs", "APP-1:100"],
          ["comments", "APP-2:0"]
        ])
        expect(yield* fixture.callCounts).toEqual({
          "changelogs:APP-1:0": 1,
          "changelogs:APP-1:100": 1,
          "comments:APP-1:0": 1,
          "comments:APP-1:100": 1,
          "comments:APP-2:0": 1,
          "issues:first": 1,
          "issues:issues-2": 1,
          "worklogs:APP-1:0": 1,
          "worklogs:APP-1:100": 1
        })
      })
  )

  it.effect("emits exactly one rate limit after scenario selection", () =>
    Effect.gen(function* () {
      const { client, fixture } = yield* fixtureClient("happy_path")
      yield* fixture.setScenario("rate_limited_once")

      const first = yield* client
        .currentUser("fixture-user-1", "fixture-cloud-1")
        .pipe(Effect.flip)
      const second = yield* client.currentUser(
        "fixture-user-1",
        "fixture-cloud-1"
      )

      expect(first).toMatchObject({
        _tag: "JiraRateLimited",
        retryAfterMillis: 1000
      })
      expect(second.accountId).toBe("fixture-account-1")
      expect(yield* fixture.callCounts).toEqual({ "currentUser:single": 2 })
    })
  )

  it.effect(
    "expires one OAuth refresh and then issues a stable rotating grant",
    () =>
      Effect.gen(function* () {
        const fixture = yield* createJiraBrowserFixture("reconnect_once")

        const first = yield* fixture.tokenEndpoint
          .refresh("fixture-refresh-token")
          .pipe(Effect.flip)
        const second = yield* fixture.tokenEndpoint.refresh(
          "fixture-refresh-token"
        )

        expect(first).toMatchObject({
          _tag: "JiraReconnectRequired",
          reason: "invalid_grant"
        })
        expect(second).toEqual({
          accessToken: "fixture-access-token-2",
          refreshToken: "fixture-refresh-token-2",
          expiresAt: DateTime.toDate(
            DateTime.makeUnsafe("2026-09-22T11:00:00.000Z")
          ),
          grantedScopes: expect.arrayContaining([
            "offline_access",
            "read:jira-work"
          ])
        })
        expect(yield* fixture.callCounts).toEqual({ "oauth.refresh:single": 2 })
      })
  )

  it.effect("holds attachment bytes until the fixture releases them", () =>
    Effect.gen(function* () {
      const { client, fixture } = yield* fixtureClient("pause_attachment")
      const fiber = yield* client
        .attachmentContent("fixture-user-1", "fixture-cloud-1", "attachment-2")
        .pipe(Stream.runCollect, Effect.forkChild)
      yield* Effect.yieldNow

      expect(fiber.pollUnsafe()).toBeUndefined()
      expect(yield* fixture.callCounts).toEqual({
        "attachmentContent:attachment-2": 1
      })

      yield* fixture.releaseAttachment
      const chunks = yield* Fiber.join(fiber)

      expect(Array.from(chunks[0].slice(0, 8))).toEqual([
        137, 80, 78, 71, 13, 10, 26, 10
      ])
    })
  )
})
