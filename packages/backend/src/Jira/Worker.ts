import {
  and,
  asc,
  eq,
  isNull,
  lt,
  or,
  sql as drizzleSql,
  type SQL
} from "drizzle-orm"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schedule from "effect/Schedule"
import * as Schema from "effect/Schema"
import * as SqlClient from "effect/unstable/sql/SqlClient"
import { jiraMigration, member, organization, user } from "../db/schema"
import { Db } from "../Services/Db"
import { OrgStorage } from "../Services/OrgStorage"
import { S3Storage } from "../Services/S3Storage"
import { GroupDocs } from "../Services/GroupDocs"
import { ProjectDocs } from "../Services/ProjectDocs"
import { TicketDocs } from "../Services/TicketDocs"
import { TicketIndex } from "../Services/TicketIndex"
import { JiraMigrationBlocked } from "./Blocked"
import { JiraMigrationReport } from "./Report"
import { JiraClient } from "./Client"
import {
  buildJiraImportPlan,
  copyJiraAttachments,
  jiraImportEnvironment,
  markJiraAttachmentsLive,
  publishJiraMigration,
  resolveJiraImportMembers,
  writeJiraStagedDocuments,
  type JiraImportDependencies
} from "./Import"
import { JiraMigrationManifest } from "./Manifest"
import { buildJiraScanArtifacts } from "./Scan"

const LEASE_SECONDS = 30

type ClaimedMigration = typeof jiraMigration.$inferSelect & {
  readonly leaseId: string
}

const objectKey = (prefix: string | null, path: string) => {
  const root = (prefix ?? "").replace(/^\/+|\/+$/g, "")
  return root === "" ? path : `${root}/${path}`
}

const jqlProject = (key: string) =>
  `project = "${key.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}" ORDER BY key ASC`

export const JiraMigrationWorkerLive = Layer.effectDiscard(
  Effect.gen(function* () {
    const db = yield* Db
    const sql = yield* SqlClient.SqlClient
    const jira = yield* JiraClient
    const orgStorage = yield* OrgStorage
    const s3 = yield* S3Storage
    const projectDocs = yield* ProjectDocs
    const ticketDocs = yield* TicketDocs
    const groupDocs = yield* GroupDocs
    const ticketIndex = yield* TicketIndex
    const importDeps: JiraImportDependencies = {
      db,
      projectDocs,
      ticketDocs,
      groupDocs,
      ticketIndex
    }

    const claimNext = Effect.fn("JiraMigrationWorker.claimNext")(function* (
      match: SQL
    ) {
      const now = yield* DateTime.nowAsDate
      const candidate = yield* db
        .select()
        .from(jiraMigration)
        .where(
          and(
            match,
            or(
              isNull(jiraMigration.leaseExpiresAt),
              lt(jiraMigration.leaseExpiresAt, now)
            )
          )
        )
        .orderBy(asc(jiraMigration.createdAt))
        .limit(1)
        .pipe(Effect.orDie)
      if (!candidate[0]) return null
      const [{ id: leaseId }] = yield* sql<{ readonly id: string }>`
        SELECT gen_random_uuid()::text AS id
      `.pipe(Effect.orDie)
      const leaseExpiresAt = DateTime.toDate(
        DateTime.add(DateTime.fromDateUnsafe(now), { seconds: LEASE_SECONDS })
      )
      const claimed = yield* db
        .update(jiraMigration)
        .set({ leaseId, leaseExpiresAt, updatedAt: now })
        .where(
          and(
            eq(jiraMigration.id, candidate[0].id),
            match,
            or(
              isNull(jiraMigration.leaseExpiresAt),
              lt(jiraMigration.leaseExpiresAt, now)
            )
          )
        )
        .returning()
        .pipe(Effect.orDie)
      return claimed[0]
        ? ({ ...claimed[0], leaseId } satisfies ClaimedMigration)
        : null
    })

    const renew = Effect.fn("JiraMigrationWorker.renew")(function* (
      job: ClaimedMigration,
      progressDone: number,
      progressTotal: number | null = null
    ) {
      const now = yield* DateTime.nowAsDate
      const leaseExpiresAt = DateTime.toDate(
        DateTime.add(DateTime.fromDateUnsafe(now), { seconds: LEASE_SECONDS })
      )
      const rows = yield* db
        .update(jiraMigration)
        .set({ progressDone, progressTotal, leaseExpiresAt, updatedAt: now })
        .where(
          and(
            eq(jiraMigration.id, job.id),
            eq(jiraMigration.leaseId, job.leaseId),
            eq(jiraMigration.status, "scanning")
          )
        )
        .returning({ id: jiraMigration.id })
        .pipe(Effect.orDie)
      if (!rows[0]) return yield* Effect.interrupt
    })

    const renewMigrating = Effect.fn("JiraMigrationWorker.renewMigrating")(
      function* (
        job: ClaimedMigration,
        progressDone: number,
        progressTotal: number | null = null
      ) {
        const now = yield* DateTime.nowAsDate
        const leaseExpiresAt = DateTime.toDate(
          DateTime.add(DateTime.fromDateUnsafe(now), { seconds: LEASE_SECONDS })
        )
        const rows = yield* db
          .update(jiraMigration)
          .set(
            progressTotal === null
              ? { progressDone, leaseExpiresAt, updatedAt: now }
              : { progressDone, progressTotal, leaseExpiresAt, updatedAt: now }
          )
          .where(
            and(
              eq(jiraMigration.id, job.id),
              eq(jiraMigration.leaseId, job.leaseId),
              eq(jiraMigration.status, "migrating")
            )
          )
          .returning({ id: jiraMigration.id })
          .pipe(Effect.orDie)
        if (!rows[0]) return yield* Effect.interrupt
      }
    )

    const scan = Effect.fn("JiraMigrationWorker.scan")(function* (
      job: ClaimedMigration
    ) {
      const org = yield* db
        .select({ slug: organization.slug })
        .from(organization)
        .where(eq(organization.id, job.organizationId))
        .limit(1)
        .pipe(Effect.orDie)
      if (!org[0]) return yield* Effect.interrupt
      const connection = yield* orgStorage.requireConnection(org[0].slug)
      yield* renew(job, 0)
      const project = yield* jira.project(
        job.initiatedBy,
        job.sourceCloudId,
        job.sourceProjectId
      )
      yield* renew(job, 1)
      const statuses = yield* jira.projectStatuses(
        job.initiatedBy,
        job.sourceCloudId,
        job.sourceProjectId
      )
      yield* renew(job, 2)
      const priorities = yield* jira.priorities(
        job.initiatedBy,
        job.sourceCloudId
      )
      const components = yield* jira.components(
        job.initiatedBy,
        job.sourceCloudId,
        job.sourceProjectId
      )
      const versions = yield* jira.versions(
        job.initiatedBy,
        job.sourceCloudId,
        job.sourceProjectId
      )
      yield* renew(job, 5)
      const issues = yield* jira.searchIssues(
        job.initiatedBy,
        job.sourceCloudId,
        {
          jql: jqlProject(project.key),
          fields: [
            "summary",
            "description",
            "status",
            "issuetype",
            "priority",
            "assignee",
            "labels",
            "components",
            "parent",
            "attachment",
            "fixVersions",
            "security",
            "created",
            "updated"
          ]
        }
      )
      const progressTotal = 11 + issues.length * 2
      yield* renew(job, 6, progressTotal)
      const comments = yield* Effect.forEach(
        issues,
        (issue) =>
          jira
            .comments(job.initiatedBy, job.sourceCloudId, issue.id)
            .pipe(Effect.map((values) => [issue.id, values] as const)),
        { concurrency: 4 }
      )
      yield* renew(job, 6 + issues.length, progressTotal)
      const worklogs = yield* Effect.forEach(
        issues,
        (issue) =>
          jira
            .worklogs(job.initiatedBy, job.sourceCloudId, issue.id)
            .pipe(Effect.map((values) => [issue.id, values] as const)),
        { concurrency: 4 }
      )
      yield* renew(job, 6 + issues.length * 2, progressTotal)
      const boards = yield* jira.boards(
        job.initiatedBy,
        job.sourceCloudId,
        job.sourceProjectId
      )
      yield* renew(job, 7 + issues.length * 2, progressTotal)
      const boardSprints = yield* Effect.forEach(
        boards,
        (board) =>
          jira
            .sprints(job.initiatedBy, job.sourceCloudId, board.id)
            .pipe(
              Effect.map((sprints) =>
                sprints.map((sprint) => ({ boardId: board.id, sprint }))
              )
            ),
        { concurrency: 2 }
      ).pipe(Effect.map((pages) => pages.flat()))
      yield* renew(job, 8 + issues.length * 2, progressTotal)
      const uniqueSprints = [
        ...new Map(
          boardSprints.map((entry) => [entry.sprint.id, entry])
        ).values()
      ]
      const sprintMemberships = yield* Effect.forEach(
        uniqueSprints,
        ({ boardId, sprint }) =>
          jira
            .sprintIssues(
              job.initiatedBy,
              job.sourceCloudId,
              boardId,
              sprint.id,
              ["id"]
            )
            .pipe(
              Effect.map((sprintIssues) => ({
                sprint,
                issueIds: sprintIssues.map(({ id }) => id)
              }))
            ),
        { concurrency: 2 }
      )
      yield* renew(job, 9 + issues.length * 2, progressTotal)
      const identityOptions = yield* db
        .select({
          id: user.id,
          name: user.name,
          email: user.email,
          imageUrl: user.image
        })
        .from(member)
        .innerJoin(user, eq(user.id, member.userId))
        .where(eq(member.organizationId, job.organizationId))
        .pipe(Effect.orDie)
      const scannedAt = yield* DateTime.now
      const artifacts = yield* buildJiraScanArtifacts({
        migrationId: job.id,
        cloudId: job.sourceCloudId,
        siteName: job.sourceSiteName,
        siteUrl: job.sourceSiteUrl,
        project,
        statuses,
        priorities,
        components,
        versions,
        issues,
        commentsByIssue: Object.fromEntries(comments),
        worklogsByIssue: Object.fromEntries(worklogs),
        sprints: sprintMemberships,
        identityOptions,
        scannedAt
      })
      yield* renew(job, 10 + issues.length * 2, progressTotal)
      const manifestJson = yield* Schema.encodeEffect(
        Schema.fromJsonString(JiraMigrationManifest)
      )(artifacts.manifest)
      const bytes = new TextEncoder().encode(manifestJson)
      yield* s3.putObject(
        connection,
        objectKey(connection.keyPrefix, `${job.stagingPrefix}/manifest.json`),
        "application/json",
        bytes
      )
      const now = yield* DateTime.nowAsDate
      yield* db
        .update(jiraMigration)
        .set({
          status: "needs_configuration",
          phase: "configuration",
          checkpoint: {
            scan: {
              summary: artifacts.summary,
              requirements: artifacts.requirements
            }
          },
          progressDone: progressTotal,
          progressTotal,
          scanAt: now,
          leaseId: null,
          leaseExpiresAt: null,
          revision: drizzleSql`${jiraMigration.revision} + 1`,
          updatedAt: now
        })
        .where(
          and(
            eq(jiraMigration.id, job.id),
            eq(jiraMigration.leaseId, job.leaseId),
            eq(jiraMigration.status, "scanning")
          )
        )
        .pipe(Effect.orDie)
    })

    const migrate = Effect.fn("JiraMigrationWorker.migrate")(function* (
      job: ClaimedMigration
    ) {
      const org = yield* db
        .select({ slug: organization.slug })
        .from(organization)
        .where(eq(organization.id, job.organizationId))
        .limit(1)
        .pipe(Effect.orDie)
      if (!org[0]) return yield* Effect.interrupt
      const orgSlug = org[0].slug
      const connection = yield* orgStorage.requireConnection(orgSlug)

      const raw = yield* s3.getObject(
        connection,
        objectKey(connection.keyPrefix, `${job.stagingPrefix}/manifest.json`)
      )
      if (!raw) return yield* new JiraMigrationBlocked({ blockers: [] })
      const manifest = yield* Schema.decodeEffect(
        Schema.fromJsonString(JiraMigrationManifest)
      )(new TextDecoder().decode(raw)).pipe(Effect.orDie)

      yield* renewMigrating(job, 0, manifest.issues.length + 2)
      const environment = yield* jiraImportEnvironment(
        importDeps,
        job.organizationId,
        job.destinationProjectSlug
      )
      const probe = buildJiraImportPlan(
        manifest,
        job.configuration,
        environment,
        {}
      )
      if (probe.kind === "blocked") {
        return yield* new JiraMigrationBlocked({
          blockers: probe.blockers.map(({ code, subjectId }) => ({
            code,
            subjectId
          }))
        })
      }

      const acceptedAttachmentIds = new Set(
        probe.plan.attachments.map(
          ({ sourceAttachmentId }) => sourceAttachmentId
        )
      )
      const ticketIdBySourceIssueId = new Map(
        probe.plan.tickets.map((ticket) => [ticket.sourceIssueId, ticket.id])
      )
      const attachmentUrls = yield* copyJiraAttachments(importDeps, jira, s3, {
        organizationId: job.organizationId,
        orgSlug,
        projectSlug: probe.plan.project.slug,
        userId: job.initiatedBy,
        cloudId: job.sourceCloudId,
        connection,
        ticketIdBySourceIssueId,
        attachments: manifest.attachments.filter(({ id }) =>
          acceptedAttachmentIds.has(id)
        )
      })

      const planResult = buildJiraImportPlan(
        manifest,
        job.configuration,
        environment,
        attachmentUrls
      )
      if (planResult.kind === "blocked") {
        return yield* new JiraMigrationBlocked({
          blockers: planResult.blockers.map(({ code, subjectId }) => ({
            code,
            subjectId
          }))
        })
      }

      const members = yield* resolveJiraImportMembers(
        importDeps,
        job.initiatedBy,
        planResult.plan
      )

      yield* writeJiraStagedDocuments(
        importDeps,
        orgSlug,
        job.initiatedBy,
        planResult.plan,
        members
      )
      yield* renewMigrating(job, manifest.issues.length + 1)

      const reportPath = `${job.stagingPrefix}/report.json`
      const report = yield* Schema.encodeEffect(
        Schema.fromJsonString(JiraMigrationReport)
      )({
        migrationId: job.id,
        projectSlug: planResult.plan.project.slug,
        tickets: planResult.plan.tickets.length,
        comments: planResult.plan.comments.length,
        groups: planResult.plan.groups.length,
        createdStatuses: planResult.plan.createdStatuses.map(
          ({ slug }) => slug
        ),
        tags: planResult.plan.tags.map(({ name }) => name),
        attachmentsPending: planResult.plan.attachments.length
      }).pipe(Effect.orDie)
      yield* s3.putObject(
        connection,
        objectKey(connection.keyPrefix, reportPath),
        "application/json",
        new TextEncoder().encode(report)
      )

      yield* markJiraAttachmentsLive(
        importDeps,
        job.organizationId,
        planResult.plan.project.slug
      )

      yield* publishJiraMigration(importDeps, {
        migrationId: job.id,
        organizationId: job.organizationId,
        orgSlug,
        ownerId: job.initiatedBy,
        leaseId: job.leaseId,
        reportPath,
        plan: planResult.plan,
        members
      })
    })

    const updateFailure = (
      job: ClaimedMigration,
      values: Partial<typeof jiraMigration.$inferInsert>,
      bumpRevision = false
    ) =>
      Effect.gen(function* () {
        const now = yield* DateTime.nowAsDate
        yield* db
          .update(jiraMigration)
          .set(
            bumpRevision
              ? {
                  ...values,
                  leaseId: null,
                  leaseExpiresAt: null,
                  revision: drizzleSql`${jiraMigration.revision} + 1`,
                  updatedAt: now
                }
              : {
                  ...values,
                  leaseId: null,
                  leaseExpiresAt: null,
                  updatedAt: now
                }
          )
          .where(
            and(
              eq(jiraMigration.id, job.id),
              eq(jiraMigration.leaseId, job.leaseId)
            )
          )
          .pipe(Effect.orDie)
      })

    const scanMatch = and(
      eq(jiraMigration.status, "scanning"),
      eq(jiraMigration.phase, "queued_scan")
    ) as SQL
    const migrateMatch = eq(jiraMigration.status, "migrating") as SQL
    const cancelMatch = eq(jiraMigration.status, "cancelling") as SQL

    const finishCancellation = Effect.fn("JiraMigrationWorker.finishCancel")(
      function* (job: ClaimedMigration) {
        const now = yield* DateTime.nowAsDate
        yield* db
          .update(jiraMigration)
          .set({
            status: "cancelled",
            phase: "cancelled",
            finishedAt: now,
            leaseId: null,
            leaseExpiresAt: null,
            revision: drizzleSql`${jiraMigration.revision} + 1`,
            updatedAt: now
          })
          .where(
            and(
              eq(jiraMigration.id, job.id),
              eq(jiraMigration.leaseId, job.leaseId)
            )
          )
          .pipe(Effect.orDie)
      }
    )

    const workOnce = Effect.gen(function* () {
      const cancelling = yield* claimNext(cancelMatch)
      if (cancelling) return yield* finishCancellation(cancelling)

      const migrating = yield* claimNext(migrateMatch)
      if (migrating) {
        const outcome = yield* Effect.result(migrate(migrating))
        if (outcome._tag === "Success") return
        yield* Effect.logError("Jira migration migrate failed", outcome.failure)
        const failure = outcome.failure
        if (failure._tag === "JiraReconnectRequired") {
          return yield* updateFailure(
            migrating,
            { status: "reconnect_required", phase: "migrate" },
            true
          )
        }
        if (
          failure._tag === "JiraRateLimited" ||
          (failure._tag === "JiraError" &&
            ["network", "timeout", "server_error"].includes(failure.reason))
        ) {
          return yield* updateFailure(migrating, {})
        }
        const storage =
          failure._tag === "S3Unavailable" ||
          failure._tag === "StorageNotConnected" ||
          failure._tag === "StorageConfigMissing"
        return yield* updateFailure(
          migrating,
          {
            status: "failed",
            phase: "migrate",
            failureReason: storage
              ? "storage_unavailable"
              : failure._tag === "JiraMigrationBlocked"
                ? "preflight_blocked"
                : failure._tag,
            failureRetryable: storage,
            finishedAt: yield* DateTime.nowAsDate
          },
          true
        )
      }

      const job = yield* claimNext(scanMatch)
      if (!job) return
      const result = yield* Effect.result(scan(job))
      if (result._tag === "Success") return
      const error = result.failure
      if (error._tag === "JiraReconnectRequired") {
        yield* updateFailure(
          job,
          { status: "reconnect_required", phase: "scan" },
          true
        )
      } else if (
        error._tag === "JiraRateLimited" ||
        (error._tag === "JiraError" &&
          ["network", "timeout", "server_error"].includes(error.reason))
      ) {
        yield* updateFailure(job, {})
      } else {
        const storage =
          error._tag === "S3Unavailable" ||
          error._tag === "StorageNotConnected" ||
          error._tag === "StorageConfigMissing"
        yield* updateFailure(
          job,
          {
            status: "failed",
            phase: "scan",
            failureReason: storage ? "storage_unavailable" : error._tag,
            failureRetryable: storage,
            finishedAt: yield* DateTime.nowAsDate
          },
          true
        )
      }
    }).pipe(
      Effect.catchCause(() =>
        Effect.logError("Jira migration worker iteration failed")
      )
    )

    yield* Effect.forkDetach(
      Effect.repeat(workOnce, Schedule.spaced("1 second"))
    )
  })
)
