// @effect-diagnostics-next-line nodeBuiltinImport:off
import { randomUUID } from "node:crypto"

import { Db } from "@pp/db"
import {
  jiraMigration,
  member,
  organization,
  userJiraIntegration
} from "@pp/db/schema"
import * as Client from "@pp/integration-jira/Client"
import * as MigrationArtifacts from "@pp/integration-jira/MigrationArtifacts"
import * as MigrationProjection from "@pp/integration-jira/MigrationProjection"
import * as Migrations from "@pp/integration-jira/Migrations"
import * as OrgStorage from "@pp/server-core/storage/OrgStorage"
import {
  JiraMigrationConfiguration,
  type JiraMigrationDetail,
  type JiraMigrationRequirements
} from "@pp/shared"
import { and, eq } from "drizzle-orm"
import {
  Config,
  DateTime,
  Duration,
  Effect,
  Layer,
  Ref,
  Schedule,
  Schema
} from "effect"

import { createJiraBrowserFixture } from "../src/jira/BrowserFixtures"
import {
  GENERATED_PROJECT,
  jiraFixtureScaleConfig
} from "../src/jira/generatedSite"
import {
  browserResourcesFromEnv,
  jiraFixtureLayers,
  prepareBrowserEnvironment,
  provisionResources
} from "./jira-browser-harness"

type Sample = Readonly<{ rss: number; heapUsed: number }>

const megabytes = (bytes: number) => Math.round(bytes / 1024 / 1024)

const defaultConfiguration = (
  requirements: JiraMigrationRequirements,
  stamp: string,
  sprintChoice: "none" | "first"
) => ({
  destination: {
    name: `${requirements.destination.suggestedName} ${stamp}`,
    slug: `gen-load-${stamp}`,
    key: `L${stamp.toUpperCase()}`.slice(0, 10)
  },
  identities: requirements.identities.map((identity) => ({
    jiraAccountId: identity.jiraAccountId,
    projectProjectUserId: identity.suggestedProjectProjectUserId
  })),
  statuses: requirements.statuses.map((status) => ({
    jiraStatusId: status.jiraStatusId,
    projectStatusSlug: status.suggestedProjectStatusSlug ?? "todo"
  })),
  issueTypes: requirements.issueTypes.map((issueType) => ({
    jiraIssueTypeId: issueType.jiraIssueTypeId,
    projectType: issueType.suggestedProjectType
  })),
  priorities: requirements.priorities.map((priority) => ({
    jiraPriorityId: priority.jiraPriorityId,
    projectPriority: priority.suggestedProjectPriority ?? "med"
  })),
  tags: requirements.tags.flatMap((tag) =>
    tag.suggestedDestinationTagName === null
      ? []
      : [
          {
            source: tag.source,
            destinationTagName: tag.suggestedDestinationTagName
          }
        ]
  ),
  activeFutureSprintChoices: requirements.activeFutureSprintChoices.map(
    (choice) => ({
      jiraIssueId: choice.jiraIssueId,
      jiraSprintId:
        sprintChoice === "first"
          ? (choice.options[0]?.jiraSprintId ?? null)
          : null
    })
  ),
  restrictedContent: { policy: "exclude" },
  skippedAttachmentIds: requirements.attachments
    .filter((attachment) => attachment.forcedSkipReason !== null)
    .map((attachment) => attachment.jiraAttachmentId),
  attachmentSkipsAccepted: true
})

const program = Effect.gen(function* () {
  const startedAt = yield* DateTime.now
  const orgSlug = yield* Config.String("JIRA_LOAD_ORG").pipe(
    Config.withDefault("jira-harness-4")
  )
  const timeout = yield* Config.Number("JIRA_LOAD_TIMEOUT_MINUTES").pipe(
    Config.withDefault(240)
  )
  const scale = yield* jiraFixtureScaleConfig
  const sprintChoice = yield* Config.Literals(
    ["none", "first"],
    "JIRA_LOAD_SPRINT_CHOICE"
  ).pipe(Config.withDefault("none" as const))
  const peak = yield* Ref.make<Sample>({ rss: 0, heapUsed: 0 })
  yield* Effect.forkChild(
    Effect.sync(() => process.memoryUsage()).pipe(
      Effect.flatMap((usage) =>
        Ref.update(peak, (current) => ({
          rss: Math.max(current.rss, usage.rss),
          heapUsed: Math.max(current.heapUsed, usage.heapUsed)
        }))
      ),
      Effect.repeat(Schedule.spaced("250 millis"))
    )
  )
  const log = (message: string) =>
    Effect.gen(function* () {
      const now = yield* DateTime.now
      const elapsed = Duration.toSeconds(DateTime.distance(startedAt, now))
      const usage = process.memoryUsage()
      console.log(
        `[load +${elapsed.toFixed(1)}s rss=${megabytes(usage.rss)}MB heap=${megabytes(usage.heapUsed)}MB] ${message}`
      )
    })

  yield* log(
    `scale issues=${scale.issues} comments=${scale.comments} attachments=${scale.attachments} faults=${JSON.stringify(scale.faults)}`
  )
  const db = yield* Db
  const [target] = yield* db
    .select({
      organizationId: organization.id,
      userId: userJiraIntegration.userId
    })
    .from(organization)
    .innerJoin(member, eq(member.organizationId, organization.id))
    .innerJoin(
      userJiraIntegration,
      eq(userJiraIntegration.userId, member.userId)
    )
    .where(
      and(
        eq(organization.slug, orgSlug),
        eq(member.role, "owner"),
        eq(userJiraIntegration.status, "active")
      )
    )
    .limit(1)
  if (!target)
    return yield* Effect.die(
      `No owner with an active Jira connection in org ${orgSlug}`
    )

  const jira = yield* Client.JiraClient
  const migrations = yield* Migrations.JiraMigrations
  const phases: Array<string> = []
  const timed = <A, E, R>(name: string, effect: Effect.Effect<A, E, R>) =>
    Effect.gen(function* () {
      const before = yield* DateTime.now
      const result = yield* effect
      const after = yield* DateTime.now
      const seconds = Duration.toSeconds(DateTime.distance(before, after))
      phases.push(`${name}=${seconds.toFixed(1)}s`)
      yield* log(`${name} finished in ${seconds.toFixed(1)}s`)
      return result
    })

  const created = yield* timed(
    "create",
    Effect.gen(function* () {
      const sites = yield* jira.accessibleSites(target.userId)
      const site = sites.find(({ cloudId }) => cloudId === "fixture-cloud-1")
      const projects = yield* jira.projects(target.userId, site!.cloudId)
      const project = projects.find(({ id }) => id === GENERATED_PROJECT.id)
      return yield* migrations.create(
        target.organizationId,
        target.userId,
        randomUUID(),
        {
          cloudId: site!.cloudId,
          siteName: site!.name,
          siteUrl: site!.url,
          projectId: project!.id,
          projectKey: project!.key,
          projectName: project!.name
        }
      )
    }).pipe(Effect.retry(Schedule.recurs(5)))
  )
  yield* log(`migration ${created.id}`)

  const waitWhile = (statuses: ReadonlyArray<string>) =>
    Effect.gen(function* () {
      let lastPhase = ""
      while (true) {
        const detail: JiraMigrationDetail = yield* migrations.get(
          target.organizationId,
          target.userId,
          created.id
        )
        const phase = `${detail.status}/${detail.phase} ${detail.progress.done}/${detail.progress.total ?? "?"}`
        if (phase !== lastPhase) {
          yield* log(phase)
          lastPhase = phase
        }
        if (!statuses.includes(detail.status)) return detail
        yield* Effect.sleep("1 second")
      }
    })

  const scanned = yield* timed("scan", waitWhile(["scanning"]))
  const preparationReasons = Effect.gen(function* () {
    const { buildJiraPreparedPublicationFromSnapshot } = yield* Effect.promise(
      () => import("../src/jira/PublicationLive")
    )
    const [row] = yield* db
      .select()
      .from(jiraMigration)
      .where(eq(jiraMigration.id, created.id))
    const checkpoint = yield* MigrationProjection.decodeCheckpoint(
      row!.checkpoint
    )
    const accepted = checkpoint.acceptedConfiguration
    const manifestRef = checkpoint.scan?.manifest
    if (!accepted || !manifestRef) return ["no accepted configuration"]
    const connection = yield* (yield* OrgStorage.OrgStorage).requireConnection(
      orgSlug
    )
    return yield* buildJiraPreparedPublicationFromSnapshot(
      {
        fence: {
          migrationId: row!.id,
          workflowExecutionId: row!.workflowExecutionId!,
          workflowAttempt: row!.workflowAttempt
        },
        manifestRef,
        configurationRevision: accepted.configurationRevision,
        configuration: accepted.configuration,
        migrationCreatedAt: row!.createdAt.toISOString(),
        organizationId: row!.organizationId,
        orgSlug,
        ownerId: row!.initiatedBy,
        connection
      },
      yield* MigrationArtifacts.JiraMigrationArtifacts
    ).pipe(
      Effect.as(["preparation succeeded on re-run"]),
      Effect.catch((error) =>
        Effect.succeed(
          "reasons" in error && Array.isArray(error.reasons)
            ? error.reasons
            : [error._tag]
        )
      )
    )
  })
  const report = (detail: JiraMigrationDetail) =>
    Effect.gen(function* () {
      const memory = yield* Ref.get(peak)
      const reasons =
        detail.failure?.reason === "jira_migration_preparation_invalid" ||
        detail.failure?.reason === "jira_migration_publication_invalid"
          ? yield* preparationReasons
          : null
      console.log(
        JSON.stringify(
          {
            migrationId: created.id,
            status: detail.status,
            phase: detail.phase,
            failure: detail.failure,
            preparationReasons: reasons,
            phases,
            counts: detail.scanSummary?.counts ?? null,
            result:
              detail.result === undefined
                ? null
                : {
                    ...detail.result,
                    findings: detail.result.findings.length,
                    findingKinds: detail.result.findings.reduce<
                      Record<string, number>
                    >((kinds, { kind }) => {
                      kinds[kind] = (kinds[kind] ?? 0) + 1
                      return kinds
                    }, {}),
                    firstFindings: detail.result.findings.slice(0, 12)
                  },
            visibilityWarnings:
              detail.scanSummary?.visibilityWarnings.length ?? null,
            failedAttachments: detail.failedAttachmentIds.length,
            peakRssMb: megabytes(memory.rss),
            peakHeapMb: megabytes(memory.heapUsed)
          },
          null,
          2
        )
      )
    })
  if (scanned.status !== "needs_configuration" || !scanned.requirements) {
    yield* report(scanned)
    return
  }
  const stamp = Date.now().toString(36).slice(-6)
  const configured = yield* timed(
    "configure",
    migrations.configure(
      target.organizationId,
      target.userId,
      created.id,
      scanned.revision,
      yield* Schema.decodeUnknownEffect(JiraMigrationConfiguration)(
        defaultConfiguration(scanned.requirements, stamp, sprintChoice)
      )
    )
  )
  yield* log(`configured: ${configured.status}`)
  if (!configured.actions.canRun) {
    yield* report(configured)
    return
  }
  yield* migrations.run(
    target.organizationId,
    target.userId,
    created.id,
    configured.revision
  )
  const finished = yield* timed(
    "import",
    waitWhile(["ready", "migrating", "cancelling"]).pipe(
      Effect.timeout(Duration.minutes(timeout))
    )
  )
  yield* report(finished)
})

const resources = browserResourcesFromEnv()
prepareBrowserEnvironment(resources)
const BunRuntime = await import("@effect/platform-bun/BunRuntime")
const { BackendInfrastructureLive, makeBackendServicesLive } =
  await import("../src/runtime")

BunRuntime.runMain(
  Effect.gen(function* () {
    yield* provisionResources(resources)
    const fixture = yield* createJiraBrowserFixture(
      "happy_path",
      yield* jiraFixtureScaleConfig
    )
    const services = makeBackendServicesLive(
      ...jiraFixtureLayers(fixture)
    ).pipe(Layer.provideMerge(BackendInfrastructureLive))
    yield* program.pipe(Effect.provide(services))
    const counts = yield* fixture.callCounts
    const byOperation = Object.entries(counts).reduce<Record<string, number>>(
      (totals, [key, count]) => {
        const operation = key.slice(0, key.indexOf(":"))
        totals[operation] = (totals[operation] ?? 0) + count
        return totals
      },
      {}
    )
    console.log(JSON.stringify({ jiraCalls: byOperation }, null, 2))
  }).pipe(Effect.scoped)
)
