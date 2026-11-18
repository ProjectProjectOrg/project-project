// @effect-diagnostics-next-line nodeBuiltinImport:off
import { createHash } from "node:crypto"

import { Db } from "@pp/db"
import {
  jiraIdentityClaim,
  jiraMigration,
  member,
  organization,
  projectIndex,
  projectKey,
  ticketIndex,
  user as userTable
} from "@pp/db/schema"
import type * as Client from "@pp/integration-jira/Client"
import {
  canonicalJiraJson,
  JiraMigrationManifestV2
} from "@pp/integration-jira/Manifest"
import { jiraDestinationTicketId } from "@pp/integration-jira/Mappings"
import {
  classifyJiraFailure,
  errorDetail,
  jiraDocumentBatches
} from "@pp/integration-jira/MigrationActivities"
import * as MigrationArtifacts from "@pp/integration-jira/MigrationArtifacts"
import * as MigrationProjection from "@pp/integration-jira/MigrationProjection"
import {
  JiraMigrationWorkflowFailure,
  type JiraMigrationWorkflowFailureValue
} from "@pp/integration-jira/MigrationWorkflow"
import { JiraPublicationInvalid } from "@pp/integration-jira/Preflight"
import {
  jiraArchivePath,
  jiraProjectIdFor,
  jiraReportPath,
  JiraPreparedPublicationV1,
  JiraPublicationPlanV1,
  prepareJiraPublication,
  type JiraAttachmentOutcome
} from "@pp/integration-jira/PublicationPlan"
import * as Markdown from "@pp/server-core/markdown/Markdown"
import * as HiddenProject from "@pp/server-core/projects/hiddenProject"
import { issueProjectInvite } from "@pp/server-core/projects/projectInvite"
import type * as S3Storage from "@pp/server-core/storage/S3Storage"
import {
  BASELINE_STATUS_SEED,
  baselineStatusDescription,
  deriveProjectIdentity,
  GIT_AUTOMATION_SEED,
  JiraMigrationConfiguration,
  type JiraMigrationResult
} from "@pp/shared"
import { and, eq, sql as drizzleSql } from "drizzle-orm"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Path from "effect/Path"
import * as Predicate from "effect/Predicate"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"

const decodeUnknownJiraMigrationManifestV2 = Schema.decodeUnknownEffect(
  JiraMigrationManifestV2
)

const encodeJiraPublicationPlanV1 = Schema.encodeEffect(JiraPublicationPlanV1)

const isJiraPublicationInvalid = Schema.is(JiraPublicationInvalid)

const encodeJiraMigrationCheckpoint = Schema.encodeEffect(
  MigrationProjection.JiraMigrationCheckpoint
)

const toDate = (iso: string) => DateTime.toDate(DateTime.makeUnsafe(iso))
export type JiraPublicationSnapshotInput = Readonly<{
  fence: MigrationProjection.AttemptFence
  manifestRef: MigrationArtifacts.JiraArtifactRef
  configurationRevision: number
  configuration: JiraMigrationConfiguration
  migrationCreatedAt: string
  organizationId: string
  orgSlug: string
  ownerId: string
  connection: S3Storage.S3Connection
}>

export const buildJiraPreparedPublicationFromSnapshot = Effect.fn(
  "JiraImport.buildFromSnapshot"
)(function* (
  input: JiraPublicationSnapshotInput,
  artifacts: Pick<
    MigrationArtifacts.JiraMigrationArtifacts["Service"],
    "readJson"
  >
) {
  const db = yield* Db
  const manifest = yield* artifacts.readJson(
    input.orgSlug,
    input.manifestRef,
    decodeUnknownJiraMigrationManifestV2
  )
  if (
    manifest.migrationId !== input.fence.migrationId ||
    manifest.workflow.executionId !== input.fence.workflowExecutionId ||
    manifest.workflow.attempt !== input.fence.workflowAttempt
  )
    return yield* new JiraPublicationInvalid({
      reasons: ["scan-manifest-attempt-conflict"]
    })
  const [org] = yield* db
    .select({ slug: organization.slug })
    .from(organization)
    .where(eq(organization.id, input.organizationId))
  if (!org || org.slug !== input.orgSlug)
    return yield* new JiraPublicationInvalid({
      reasons: ["publication-organization-conflict"]
    })
  const projectId = jiraProjectIdFor(input.fence.migrationId)
  const projects = yield* db
    .select({
      id: projectIndex.id,
      slug: projectIndex.slug,
      key: drizzleSql<string>`coalesce(${projectKey.key}, ${projectIndex.key})`,
      organizationId: projectIndex.organizationId
    })
    .from(projectIndex)
    .leftJoin(projectKey, eq(projectKey.projectId, projectIndex.id))
    .where(eq(projectIndex.organizationId, input.organizationId))
  const tickets = yield* db
    .select({
      projectId: ticketIndex.projectId,
      ticketId: ticketIndex.ticketId
    })
    .from(ticketIndex)
    .where(eq(ticketIndex.organizationId, input.organizationId))
  const allUsers = yield* db
    .select({
      id: userTable.id,
      username: userTable.username,
      email: userTable.email
    })
    .from(userTable)
    .innerJoin(member, eq(member.userId, userTable.id))
    .where(eq(member.organizationId, input.organizationId))
  const linkedUserIds = new Set([
    input.ownerId,
    ...input.configuration.identities.flatMap((identity) =>
      identity.projectProjectUserId === null
        ? []
        : [identity.projectProjectUserId]
    )
  ])
  const plannedTicketIds = new Set<string>(
    manifest.issues.map(({ issueNumber }) =>
      jiraDestinationTicketId(input.configuration.destination.key, issueNumber)
    )
  )
  const source = yield* resolveJiraPublicationSource(
    input.orgSlug,
    manifest,
    artifacts
  )
  const prepared = yield* prepareJiraPublication({
    manifest,
    manifestSha256: input.manifestRef.sha256,
    configurationRevision: input.configurationRevision,
    configuration: input.configuration,
    migrationCreatedAt: input.migrationCreatedAt,
    organizationId: input.organizationId,
    orgSlug: input.orgSlug,
    ownerId: input.ownerId,
    storageKeyPrefix: input.connection.keyPrefix ?? "",
    users: allUsers
      .filter((user) => linkedUserIds.has(user.id))
      .map((user) => ({
        userId: user.id,
        username: user.username ?? user.email
      }))
      .toSorted((left, right) => left.userId.localeCompare(right.userId, "en")),
    environment: {
      existingProjectSlugs: projects
        .filter(
          (project) =>
            project.organizationId === input.organizationId &&
            project.id !== projectId &&
            project.slug === input.configuration.destination.slug
        )
        .map((project) => project.slug),
      existingProjectKeys: projects
        .filter(
          (project) =>
            project.organizationId === input.organizationId &&
            project.id !== projectId &&
            project.key === input.configuration.destination.key
        )
        .map((project) => project.key),
      existingTicketIds: tickets
        .filter(
          (ticket) =>
            ticket.projectId !== projectId &&
            plannedTicketIds.has(ticket.ticketId)
        )
        .map((ticket) => ticket.ticketId),
      existingUserIds: allUsers
        .filter((user) => linkedUserIds.has(user.id))
        .map((user) => user.id)
        .toSorted(),
      existingStatusSlugs: BASELINE_STATUS_SEED.map((status) => status.slug)
    },
    source
  })
  return prepared
}, Effect.provide(JiraPublicationFormatLive))

export const prepareJiraPublicationFromSnapshot = Effect.fn(
  "JiraImport.prepareFromSnapshot"
)(function* (
  input: JiraPublicationSnapshotInput,
  artifacts: Pick<
    MigrationArtifacts.JiraMigrationArtifacts["Service"],
    "readJson" | "writeJson"
  >
) {
  const prepared = yield* buildJiraPreparedPublicationFromSnapshot(
    input,
    artifacts
  )
  return yield* persistJiraPreparedPublication(prepared, artifacts)
})

export const verifyJiraPermanentArchive = Effect.fn(
  "JiraImport.verifyPermanentArchive"
)(function* (
  fence: MigrationProjection.AttemptFence,
  orgSlug: string,
  artifacts: Pick<
    MigrationArtifacts.JiraMigrationArtifacts["Service"],
    "readJson" | "verify"
  >
) {
  const db = yield* Db
  const markdown = yield* Markdown.Markdown
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const [migration] = yield* db
    .select()
    .from(jiraMigration)
    .where(eq(jiraMigration.id, fence.migrationId))
    .limit(1)
  if (
    !migration ||
    migration.workflowExecutionId !== fence.workflowExecutionId ||
    migration.workflowAttempt !== fence.workflowAttempt ||
    migration.status !== "succeeded" ||
    migration.destinationProjectId === null ||
    migration.destinationProjectSlug === null
  )
    return yield* new JiraPublicationInvalid({
      reasons: ["published-archive-attempt-conflict"]
    })
  const checkpoint = yield* MigrationProjection.decodeCheckpoint(
    migration.checkpoint
  )
  if (!checkpoint.publishedPlan)
    return yield* new JiraPublicationInvalid({
      reasons: ["published-archive-plan-missing"]
    })
  const [project] = yield* db
    .select()
    .from(projectIndex)
    .where(eq(projectIndex.id, migration.destinationProjectId))
    .limit(1)
  const [org] = yield* db
    .select({ slug: organization.slug })
    .from(organization)
    .where(eq(organization.id, migration.organizationId))
    .limit(1)
  if (
    !project ||
    project.publishedAt === null ||
    project.organizationId !== migration.organizationId ||
    project.slug !== migration.destinationProjectSlug ||
    org?.slug !== orgSlug
  )
    return yield* new JiraPublicationInvalid({
      reasons: ["published-archive-project-conflict"]
    })
  const archive = checkpoint.publishedPlan.archive
  const verifiedArchive = archive
    ? archive
    : yield* Effect.gen(function* () {
        const { plan, publicationRevision } = yield* loadJiraPublicationPlan(
          orgSlug,
          checkpoint.publishedPlan!.planRef,
          artifacts
        )
        if (
          plan.migrationId !== migration.id ||
          plan.project.id !== project.id ||
          plan.project.slug !== project.slug ||
          publicationRevision !== checkpoint.publishedPlan!.publicationRevision
        )
          return yield* new JiraPublicationInvalid({
            reasons: ["published-archive-plan-conflict"]
          })
        return plan.archiveDocument
      })
  if (
    verifiedArchive.path !== jiraArchivePath(migration.id) ||
    !/^[a-f0-9]{64}$/.test(verifiedArchive.sha256)
  )
    return yield* new JiraPublicationInvalid({
      reasons: ["published-archive-plan-conflict"]
    })
  const stored = yield* fs
    .readFileString(
      path.join(
        markdown.projectDir(orgSlug, project.slug),
        verifiedArchive.path
      )
    )
    .pipe(
      Effect.mapError(
        () => new JiraPublicationInvalid({ reasons: ["missing-archive"] })
      )
    )
  if (
    createHash("sha256").update(stored).digest("hex") !== verifiedArchive.sha256
  )
    return yield* new JiraPublicationInvalid({
      reasons: ["published-archive-checksum-conflict"]
    })
})

const PER_ATTACHMENT_INVALID_REASONS = new Set(["attachment-size-mismatch"])

const isJiraMigrationWorkflowFailure = Schema.is(JiraMigrationWorkflowFailure)

export const classifyMaterializationError = (error: unknown) => {
  if (isJiraMigrationWorkflowFailure(error)) return error
  const detail = errorDetail(error)
  const make = (
    reason: string,
    retryable: boolean,
    extra: Partial<JiraMigrationWorkflowFailureValue> = {}
  ) =>
    JiraMigrationWorkflowFailure.make({
      reason,
      retryable,
      ...(detail === undefined ? {} : { detail }),
      ...extra
    })
  if (isJiraPublicationInvalid(error))
    return error.reasons.includes("stale-materialization-attempt")
      ? make("jira_migration_attempt_paused", true)
      : make("jira_migration_publication_invalid", false)
  if (
    Predicate.isTagged(error, "PlatformError") ||
    Predicate.isTagged(error, "SystemError")
  )
    return make("jira_migration_file_write_failed", true, { transient: true })
  const classified = classifyJiraFailure(error)
  return classified === null
    ? make("jira_migration_materialization_failed", true)
    : JiraMigrationWorkflowFailure.make(classified)
}

export const materializationFailure = (error: unknown) => {
  const failure = classifyMaterializationError(error)
  return Effect.logWarning("Jira import unit failed", {
    reason: failure.reason,
    error
  }).pipe(Effect.andThen(Effect.fail(failure)))
}

const isPerAttachmentFailure = (error: unknown) =>
  Predicate.isTagged(error, "JiraAccessDenied") ||
  Predicate.isTagged(error, "JiraResourceNotFound") ||
  (isJiraPublicationInvalid(error) &&
    error.reasons.some((reason) => PER_ATTACHMENT_INVALID_REASONS.has(reason)))

const perAttachmentFailureReason = (error: unknown) =>
  Predicate.isTagged(error, "JiraAccessDenied")
    ? "forbidden"
    : Predicate.isTagged(error, "JiraResourceNotFound")
      ? "missing"
      : "size_mismatch"

export const makeJiraMaterializationDependencies = (
  prepared: JiraPreparedPublicationV1,
  fence: MigrationProjection.AttemptFence,
  services: Readonly<{
    connection: S3Storage.S3Connection
    jira: Pick<Client.JiraClient["Service"], "attachmentContent">
    s3: Pick<
      S3Storage.S3Storage["Service"],
      "getObject" | "putObject" | "headObject" | "deleteObject"
    >
    artifacts: Pick<
      MigrationArtifacts.JiraMigrationArtifacts["Service"],
      "writeJson" | "readJson" | "verify"
    >
  }>
) => {
  const destination = prepared.configuration.destination
  const project = {
    id: prepared.projectId,
    organizationId: prepared.organizationId,
    slug: destination.slug,
    key: destination.key,
    name: destination.name,
    ...deriveProjectIdentity(destination.slug),
    nextTicketNumber:
      Math.max(
        0,
        ...prepared.manifest.issues.map((issue) => issue.issueNumber)
      ) + 1,
    createdBy: prepared.ownerId,
    createdAt: prepared.migrationCreatedAt
  }
  const mapFailure = <A, E extends Error, R>(effect: Effect.Effect<A, E, R>) =>
    effect.pipe(Effect.catch(materializationFailure))
  const load = (ref: MigrationArtifacts.JiraArtifactRef) =>
    loadJiraPublicationPlan(prepared.orgSlug, ref, services.artifacts)
  const write = (documents: JiraPublicationPlanV1["documents"]) =>
    writeJiraHiddenDocuments({
      fence,
      projectId: project.id,
      orgSlug: prepared.orgSlug,
      projectSlug: project.slug,
      documents
    })
  return {
    error: JiraMigrationWorkflowFailure,
    createHidden: mapFailure(ensureHiddenJiraProject({ fence, project })),
    copyAttachment: (
      attachment: JiraPreparedPublicationV1["attachments"][number]
    ) =>
      mapFailure(
        copyJiraPreparedAttachment(services.jira, services.s3, {
          fence,
          projectId: project.id,
          organizationId: prepared.organizationId,
          orgSlug: prepared.orgSlug,
          projectSlug: project.slug,
          uploadedBy: prepared.ownerId,
          cloudId: prepared.manifest.source.cloudId,
          connection: services.connection,
          attachment
        }).pipe(
          Effect.catchIf(isPerAttachmentFailure, (error) =>
            Effect.logWarning("Jira attachment skipped", {
              sourceAttachmentId: attachment.sourceAttachmentId,
              error
            }).pipe(
              Effect.as({
                sourceAttachmentId: attachment.sourceAttachmentId,
                kind: "failed" as const,
                reason: perAttachmentFailureReason(error)
              })
            )
          )
        )
      ),
    finalizePlan: (outcomes: ReadonlyArray<JiraAttachmentOutcome>) =>
      mapFailure(
        persistJiraPublicationPlan(prepared, outcomes, services.artifacts).pipe(
          Effect.provide(JiraPublicationFormatLive)
        )
      ),
    writeDocumentBatch: (
      ref: MigrationArtifacts.JiraArtifactRef,
      ordinal: number
    ) =>
      mapFailure(
        Effect.gen(function* () {
          const { plan } = yield* load(ref)
          const batch = jiraDocumentBatches(plan.documents)[ordinal]
          if (!batch)
            return yield* new JiraPublicationInvalid({
              reasons: ["invalid-document-batch"]
            })
          return yield* write(batch)
        })
      ),
    writeArchive: (ref: MigrationArtifacts.JiraArtifactRef) =>
      mapFailure(
        Effect.gen(function* () {
          const { plan } = yield* load(ref)
          return yield* write([plan.archiveDocument])
        })
      ),
    writeReport: (ref: MigrationArtifacts.JiraArtifactRef) =>
      mapFailure(
        Effect.gen(function* () {
          const { plan } = yield* load(ref)
          return yield* write([plan.reportDocument])
        })
      ),
    verify: (ref: MigrationArtifacts.JiraArtifactRef) =>
      mapFailure(
        Effect.gen(function* () {
          const { plan, publicationRevision } = yield* load(ref)
          if (
            plan.migrationId !== fence.migrationId ||
            plan.project.id !== project.id ||
            plan.project.slug !== project.slug
          )
            return yield* new JiraPublicationInvalid({
              reasons: ["publication-plan-identity-conflict"]
            })
          return yield* verifyJiraHiddenMaterialization(services.s3, {
            fence,
            projectId: project.id,
            orgSlug: prepared.orgSlug,
            projectSlug: project.slug,
            planSha256: publicationRevision,
            documents: plan.documents,
            archiveDocument: plan.archiveDocument,
            reportDocument: plan.reportDocument,
            attachments: plan.attachments,
            connection: services.connection
          })
        })
      ),
    publish: (
      ref: MigrationArtifacts.JiraArtifactRef,
      verified: Readonly<{
        planSha256: string
        documentCount: number
        attachmentCount: number
        unresolvedReferenceCount: 0
      }>
    ) =>
      mapFailure(
        Effect.gen(function* () {
          const { plan, publicationRevision } = yield* load(ref)
          return yield* publishJiraMigrationAtomically({
            fence,
            planRef: ref,
            plan,
            publicationRevision,
            verified
          })
        })
      )
  }
}

export const jiraMigrationResult = (
  plan: JiraPublicationPlanV1,
  checkpoint: MigrationProjection.JiraMigrationCheckpoint
) => {
  const identities =
    checkpoint.acceptedConfiguration?.configuration.identities ?? []
  const createdStatuses = new Set(
    (checkpoint.acceptedConfiguration?.configuration.statuses ?? [])
      .filter((status) => status.createStatus === true)
      .map((status) => status.projectStatusSlug)
  )
  return {
    tickets: plan.indexes.tickets.length,
    comments: plan.indexes.comments.length,
    attachmentsCopied: plan.attachments.filter(
      (outcome) => outcome.kind === "copied"
    ).length,
    attachmentsSkipped: plan.attachments.filter(
      (outcome) => outcome.kind === "skipped" || outcome.kind === "excluded"
    ).length,
    attachmentsFailed: plan.attachments.filter(
      (outcome) => outcome.kind === "failed"
    ).length,
    peopleLinked: identities.filter(
      (identity) => identity.projectProjectUserId !== null
    ).length,
    peopleInvited: identities.filter(
      (identity) =>
        identity.projectProjectUserId === null &&
        identity.inviteEmail !== undefined
    ).length,
    peopleUnlinked: identities.filter(
      (identity) =>
        identity.projectProjectUserId === null &&
        identity.inviteEmail === undefined
    ).length,
    statusesCreated: createdStatuses.size,
    findings: [...(checkpoint.findings ?? []), ...(plan.findings ?? [])]
  } satisfies JiraMigrationResult
}
const isHiddenProjectInvalid = (
  error: unknown
): error is HiddenProject.HiddenProjectInvalid =>
  error instanceof HiddenProject.HiddenProjectInvalid

const asJiraInvalid = <A, E, R>(
  effect: Effect.Effect<A, E | HiddenProject.HiddenProjectInvalid, R>
) =>
  effect.pipe(
    Effect.catchIf(isHiddenProjectInvalid, (error) =>
      Effect.fail(new JiraPublicationInvalid({ reasons: [...error.reasons] }))
    )
  )

type JiraMigrationRow = typeof jiraMigration.$inferSelect

const isCurrentAttempt = (
  migration: JiraMigrationRow | undefined,
  fence: MigrationProjection.AttemptFence
): migration is JiraMigrationRow =>
  migration !== undefined &&
  migration.workflowExecutionId === fence.workflowExecutionId &&
  migration.workflowAttempt === fence.workflowAttempt &&
  migration.status === "migrating" &&
  migration.cleanupExecutionId === null

const holdsRemoteWriteIntent = (
  checkpoint: MigrationProjection.JiraMigrationCheckpoint,
  fence: MigrationProjection.AttemptFence
) =>
  checkpoint.remoteWritesMayStillCommit?.workflowExecutionId ===
    fence.workflowExecutionId &&
  checkpoint.remoteWritesMayStillCommit.workflowAttempt ===
    fence.workflowAttempt

const staleMaterialization = () =>
  new JiraPublicationInvalid({ reasons: ["stale-materialization-attempt"] })

type Tx = Parameters<Parameters<Db["Service"]["transaction"]>[0]>[0]

const lockMigration = (tx: Tx, fence: MigrationProjection.AttemptFence) =>
  tx
    .select()
    .from(jiraMigration)
    .where(eq(jiraMigration.id, fence.migrationId))
    .for("update")
    .pipe(Effect.map(([migration]) => migration))

const lockCurrentAttempt = (tx: Tx, fence: MigrationProjection.AttemptFence) =>
  Effect.gen(function* () {
    const migration = yield* lockMigration(tx, fence)
    if (!isCurrentAttempt(migration, fence))
      return yield* staleMaterialization()
    return migration
  })

export type JiraAtomicPublicationInput = Readonly<{
  fence: MigrationProjection.AttemptFence
  planRef: MigrationArtifacts.JiraArtifactRef
  plan: JiraPublicationPlanV1
  publicationRevision: string
  verified: Readonly<{
    planSha256: string
    documentCount: number
    attachmentCount: number
    unresolvedReferenceCount: 0
  }>
}>

const publishedIndexes = (plan: JiraPublicationPlanV1) => {
  const project = plan.indexes.project
  return {
    project,
    statuses: plan.indexes.statuses.map((row) => ({
      ...row,
      description: baselineStatusDescription(row.slug),
      createdAt: toDate(row.createdAt)
    })),
    gitAutomation: GIT_AUTOMATION_SEED.filter((rule) =>
      plan.indexes.statuses.some((row) => row.slug === rule.statusSlug)
    ).map((rule) => ({
      projectId: project.id,
      event: rule.event,
      statusSlug: rule.statusSlug
    })),
    tags: plan.indexes.tags.map((row) => ({
      ...row,
      createdAt: toDate(row.createdAt)
    })),
    members: plan.indexes.members.map((row) => ({
      projectId: row.projectId,
      organizationId: project.organizationId,
      userId: row.userId,
      roleId: row.role === "owner" ? "pm" : "developer",
      createdAt: toDate(row.createdAt)
    })),
    tickets: plan.indexes.tickets.map(
      ({ orgSlug: _orgSlug, projectSlug: _projectSlug, ...row }) => ({
        ...row,
        tags: [...row.tags],
        assignees: [...row.assignees],
        createdAt: toDate(row.createdAt),
        updatedAt: toDate(row.updatedAt)
      })
    ),
    comments: plan.indexes.comments.map(
      ({
        projectSlug: _projectSlug,
        jiraDisplayName,
        jiraAccountId,
        ...row
      }) => ({
        ...row,
        authorKind: row.authorKind === "jira" ? "imported" : row.authorKind,
        importedName: jiraDisplayName,
        importedSource: jiraDisplayName === null ? null : "jira",
        importedId: jiraAccountId,
        projectId: project.id,
        createdAt: toDate(row.createdAt),
        editedAt: row.editedAt === null ? null : toDate(row.editedAt)
      })
    ),
    activity: [],
    attachmentReferences: plan.indexes.attachmentReferences.map(
      ({ orgSlug: _orgSlug, projectSlug: _projectSlug, ...row }) => ({
        ...row,
        projectId: project.id,
        createdAt: toDate(row.createdAt)
      })
    ),
    attachments: plan.indexes.attachments.map((planned) => ({
      row: {
        id: planned.id,
        organizationId: planned.organizationId,
        orgSlug: planned.orgSlug,
        projectId: project.id,
        ticketId: planned.ticketId,
        objectKey: planned.objectKey,
        filename: planned.filename,
        contentType: planned.contentType,
        byteSize: planned.byteSize,
        contentHash: planned.contentHash,
        uploadedBy: planned.uploadedBy,
        createdAt: toDate(planned.createdAt)
      },
      committedAt: toDate(planned.committedAt)
    }))
  } satisfies HiddenProject.PublishedIndexes
}

export const publishJiraMigrationAtomically = Effect.fn(
  "JiraImport.publishAtomically"
)(function* (input: JiraAtomicPublicationInput) {
  const { fence, plan, verified } = input
  const db = yield* Db
  const encoded = yield* encodeJiraPublicationPlanV1(plan)
  const checksum = createHash("sha256")
    .update(canonicalJiraJson(encoded))
    .digest("hex")
  const copied = plan.attachments.filter(
    (attachment) => attachment.kind === "copied"
  )
  if (
    plan.migrationId !== fence.migrationId ||
    input.publicationRevision !== checksum ||
    verified.planSha256 !== checksum ||
    verified.documentCount !== plan.documents.length + 2 ||
    verified.attachmentCount !== copied.length ||
    verified.unresolvedReferenceCount !== 0
  )
    return yield* new JiraPublicationInvalid({
      reasons: ["publication-verification-mismatch"]
    })
  return yield* HiddenProject.publishHiddenProject(publishedIndexes(plan), {
    lock: (tx) =>
      Effect.gen(function* () {
        const migration = yield* lockMigration(tx, fence)
        if (
          !migration ||
          migration.workflowExecutionId !== fence.workflowExecutionId ||
          migration.workflowAttempt !== fence.workflowAttempt
        )
          return yield* new JiraPublicationInvalid({
            reasons: ["stale-publication-attempt"]
          })
        return migration
      }),
    decide: (_tx, project, migration) =>
      Effect.gen(function* () {
        const checkpoint = yield* MigrationProjection.decodeCheckpoint(
          migration.checkpoint
        )
        if (
          input.planRef.key !==
          MigrationArtifacts.artifactKey({
            migrationId: fence.migrationId,
            scanRevision: migration.scanRevision,
            area: "publication",
            kind: "plan-v1",
            identity: input.publicationRevision
          })
        )
          return yield* new JiraPublicationInvalid({
            reasons: ["publication-plan-reference-mismatch"]
          })
        if (migration.status === "succeeded") {
          if (
            project.publishedAt !== null &&
            migration.destinationProjectId === project.id &&
            migration.destinationProjectSlug === project.slug &&
            migration.reportPath === plan.reportDocument.path &&
            checkpoint.publishedPlan?.publicationRevision ===
              input.publicationRevision &&
            checkpoint.publishedPlan.planRef.key === input.planRef.key &&
            checkpoint.publishedPlan.planRef.sha256 === input.planRef.sha256
          )
            return "replayed" as const
          return yield* new JiraPublicationInvalid({
            reasons: ["publication-replay-conflict"]
          })
        }
        if (
          migration.status !== "migrating" ||
          migration.cleanupExecutionId !== null ||
          checkpoint.remoteWritesMayStillCommit !== undefined
        )
          return yield* new JiraPublicationInvalid({
            reasons: ["hidden-project-identity-conflict"]
          })
        return "publish" as const
      }),
    published: (tx, project, now, migration) =>
      Effect.gen(function* () {
        const checkpoint = yield* MigrationProjection.decodeCheckpoint(
          migration.checkpoint
        )
        yield* tx
          .update(projectIndex)
          .set({ estimation: plan.indexes.project.estimation ?? "off" })
          .where(eq(projectIndex.id, project.id))
        for (const invite of plan.invites ?? []) {
          yield* issueProjectInvite(db, {
            organizationId: migration.organizationId,
            orgSlug: plan.project.orgSlug,
            projectId: project.id,
            inviterId: migration.initiatedBy,
            email: invite.email,
            role: "developer"
          })
          yield* tx
            .insert(jiraIdentityClaim)
            .values({
              projectId: project.id,
              email: invite.email,
              jiraAccountIds: [...invite.sourceAccountIds],
              assigneeTicketIds: [...invite.assigneeTicketIds],
              reporterTicketIds: [...invite.reporterTicketIds]
            })
            .onConflictDoNothing()
        }
        const succeeded = yield* tx
          .update(jiraMigration)
          .set({
            status: "succeeded",
            destinationProjectId: project.id,
            destinationProjectSlug: project.slug,
            reportPath: plan.reportDocument.path,
            phase: "succeeded",
            progressDone: 1,
            progressTotal: 1,
            checkpoint: yield* encodeJiraMigrationCheckpoint({
              ...checkpoint,
              result: jiraMigrationResult(plan, checkpoint),
              publishedPlan: {
                planRef: input.planRef,
                publicationRevision: input.publicationRevision,
                archive: {
                  path: plan.archiveDocument.path,
                  sha256: plan.archiveDocument.sha256
                }
              }
            }),
            finishedAt: now,
            retainedUntil: null,
            failureReason: null,
            failureRetryable: null,
            revision: drizzleSql`${jiraMigration.revision} + 1`,
            updatedAt: now
          })
          .where(
            and(
              eq(jiraMigration.id, fence.migrationId),
              eq(jiraMigration.workflowExecutionId, fence.workflowExecutionId),
              eq(jiraMigration.workflowAttempt, fence.workflowAttempt),
              eq(jiraMigration.status, "migrating")
            )
          )
          .returning({ id: jiraMigration.id })
        if (succeeded.length !== 1)
          return yield* new JiraPublicationInvalid({
            reasons: ["publication-race-lost"]
          })
      })
  }).pipe(asJiraInvalid)
})

export type HiddenJiraProjectInput = Readonly<{
  fence: MigrationProjection.AttemptFence
  project: HiddenProject.HiddenProjectIdentity
}>

export const ensureHiddenJiraProject = Effect.fn(
  "JiraImport.ensureHiddenProject"
)(function* (input: HiddenJiraProjectInput) {
  const { fence, project } = input
  return yield* HiddenProject.ensureHiddenProject(project, {
    lock: (tx) =>
      Effect.gen(function* () {
        const migration = yield* lockCurrentAttempt(tx, fence)
        if (
          migration.organizationId !== project.organizationId ||
          (migration.destinationProjectId !== null &&
            migration.destinationProjectId !== project.id) ||
          (migration.destinationProjectSlug !== null &&
            migration.destinationProjectSlug !== project.slug)
        )
          return yield* staleMaterialization()
        return migration
      }),
    claimed: (tx) =>
      tx
        .update(jiraMigration)
        .set({
          destinationProjectId: project.id,
          destinationProjectSlug: project.slug
        })
        .where(eq(jiraMigration.id, fence.migrationId))
        .pipe(Effect.asVoid)
  }).pipe(asJiraInvalid)
})

export type JiraHiddenDocumentsInput = Readonly<{
  fence: MigrationProjection.AttemptFence
  projectId: string
  orgSlug: string
  projectSlug: string
  documents: JiraPublicationPlanV1["documents"]
}>

const safeJiraDocumentPath = (relative: string, migrationId: string) =>
  relative === "project.md" ||
  /^(tickets|groups)\/[A-Za-z0-9_-]+\.md$/.test(relative) ||
  relative === jiraArchivePath(migrationId) ||
  relative === jiraReportPath(migrationId)

export const writeJiraHiddenDocuments = Effect.fn(
  "JiraImport.writeHiddenDocuments"
)(function* (input: JiraHiddenDocumentsInput) {
  return yield* HiddenProject.writeHiddenDocuments(
    {
      projectId: input.projectId,
      orgSlug: input.orgSlug,
      projectSlug: input.projectSlug,
      documents: input.documents,
      isAllowedPath: (path) =>
        safeJiraDocumentPath(path, input.fence.migrationId)
    },
    (tx) => lockCurrentAttempt(tx, input.fence)
  ).pipe(asJiraInvalid)
})

export type JiraPreparedAttachmentInput = Readonly<{
  fence: MigrationProjection.AttemptFence
  projectId: string
  organizationId: string
  orgSlug: string
  projectSlug: string
  uploadedBy: string
  cloudId: string
  connection: S3Storage.S3Connection
  attachment: JiraPreparedPublicationV1["attachments"][number]
}>

export const copyJiraPreparedAttachment = Effect.fn(
  "JiraImport.copyPreparedAttachment"
)(function* (
  jira: Pick<Client.JiraClient["Service"], "attachmentContent">,
  s3: Pick<
    S3Storage.S3Storage["Service"],
    "getObject" | "putObject" | "deleteObject"
  >,
  input: JiraPreparedAttachmentInput
) {
  const { attachment, fence } = input
  if (attachment.decision !== "copy")
    return {
      sourceAttachmentId: attachment.sourceAttachmentId,
      kind: attachment.decision === "skip" ? "skipped" : "excluded"
    } satisfies JiraAttachmentOutcome
  const db = yield* Db
  const lockWriteIntent = (tx: Tx) =>
    Effect.gen(function* () {
      const migration = yield* lockCurrentAttempt(tx, fence)
      const checkpoint = yield* MigrationProjection.decodeCheckpoint(
        migration.checkpoint
      )
      if (
        migration.organizationId !== input.organizationId ||
        !holdsRemoteWriteIntent(checkpoint, fence)
      )
        return yield* staleMaterialization()
      return migration
    })
  const migrationCreatedAt = yield* db.transaction((tx) =>
    Effect.gen(function* () {
      const migration = yield* lockWriteIntent(tx)
      const [project] = yield* tx
        .select()
        .from(projectIndex)
        .where(eq(projectIndex.id, input.projectId))
        .limit(1)
      const [org] = yield* tx
        .select({ slug: organization.slug })
        .from(organization)
        .where(eq(organization.id, input.organizationId))
        .limit(1)
      if (
        !project ||
        project.publishedAt !== null ||
        project.organizationId !== input.organizationId ||
        project.slug !== input.projectSlug ||
        org?.slug !== input.orgSlug
      )
        return yield* staleMaterialization()
      return migration.createdAt
    })
  )
  let bytes = yield* s3.getObject(input.connection, attachment.objectKey)
  const uploaded = bytes === null
  if (bytes === null) {
    const chunks = yield* Stream.runCollect(
      jira.attachmentContent(
        input.uploadedBy,
        input.cloudId,
        attachment.sourceAttachmentId
      )
    )
    const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
    if (total !== attachment.byteSize)
      return yield* new JiraPublicationInvalid({
        reasons: ["attachment-size-mismatch"]
      })
    bytes = new Uint8Array(total)
    let offset = 0
    for (const chunk of chunks) {
      bytes.set(chunk, offset)
      offset += chunk.length
    }
    yield* s3.putObject(
      input.connection,
      attachment.objectKey,
      attachment.contentType,
      bytes
    )
  }
  if (bytes.length !== attachment.byteSize)
    return yield* new JiraPublicationInvalid({
      reasons: ["attachment-size-mismatch"]
    })
  const contentSha256 = createHash("sha256").update(bytes).digest("hex")
  yield* HiddenProject.recordPendingAttachment(
    {
      id: attachment.id,
      organizationId: input.organizationId,
      orgSlug: input.orgSlug,
      projectId: input.projectId,
      ticketId: attachment.ticketId,
      objectKey: attachment.objectKey,
      filename: attachment.filename,
      contentType: attachment.contentType,
      byteSize: attachment.byteSize,
      contentHash: contentSha256,
      uploadedBy: input.uploadedBy,
      createdAt: migrationCreatedAt
    },
    input.projectSlug,
    lockWriteIntent
  ).pipe(
    asJiraInvalid,
    Effect.tapError((error) =>
      uploaded &&
      isJiraPublicationInvalid(error) &&
      error.reasons.includes("stale-materialization-attempt")
        ? s3
            .deleteObject(input.connection, attachment.objectKey)
            .pipe(Effect.ignore)
        : Effect.void
    )
  )
  return {
    sourceAttachmentId: attachment.sourceAttachmentId,
    kind: "copied",
    attachmentId: attachment.id,
    objectKey: attachment.objectKey,
    byteSize: attachment.byteSize,
    contentType: attachment.contentType,
    contentSha256
  } satisfies JiraAttachmentOutcome
})

export type JiraHiddenVerificationInput = Readonly<{
  fence: MigrationProjection.AttemptFence
  projectId: string
  orgSlug: string
  projectSlug: string
  planSha256: string
  documents: JiraPublicationPlanV1["documents"]
  archiveDocument: JiraPublicationPlanV1["archiveDocument"]
  reportDocument: JiraPublicationPlanV1["reportDocument"]
  attachments: JiraPublicationPlanV1["attachments"]
  connection: S3Storage.S3Connection
}>

export const verifyJiraHiddenMaterialization = Effect.fn(
  "JiraImport.verifyHiddenMaterialization"
)(function* (
  s3: Pick<S3Storage.S3Storage["Service"], "getObject" | "headObject">,
  input: JiraHiddenVerificationInput
) {
  const db = yield* Db
  const lock = Effect.gen(function* () {
    const [migration] = yield* db
      .select()
      .from(jiraMigration)
      .where(eq(jiraMigration.id, input.fence.migrationId))
      .limit(1)
    if (!isCurrentAttempt(migration, input.fence))
      return yield* staleMaterialization()
    const checkpoint = yield* MigrationProjection.decodeCheckpoint(
      migration.checkpoint
    )
    if (!holdsRemoteWriteIntent(checkpoint, input.fence))
      return yield* staleMaterialization()
    return migration
  })
  const verified = yield* HiddenProject.verifyHiddenProject(
    s3,
    {
      projectId: input.projectId,
      orgSlug: input.orgSlug,
      projectSlug: input.projectSlug,
      documents: [
        ...input.documents,
        input.archiveDocument,
        input.reportDocument
      ],
      isAllowedPath: (path) =>
        safeJiraDocumentPath(path, input.fence.migrationId),
      unresolvedReferences: (content) =>
        (content.match(/jira-reference:/g) ?? []).length,
      attachments: input.attachments.flatMap((attachment) =>
        attachment.kind === "copied" ? [attachment] : []
      ),
      connection: input.connection
    },
    lock
  ).pipe(asJiraInvalid)
  return {
    planSha256: input.planSha256,
    documentCount: verified.documentCount,
    attachmentCount: verified.attachmentCount,
    unresolvedReferenceCount: 0 as const
  }
})

import {
  resolveJiraPublicationSource,
  persistJiraPreparedPublication,
  persistJiraPublicationPlan,
  loadJiraPublicationPlan
} from "@pp/integration-jira/PublicationArtifacts"

import { JiraPublicationFormatLive } from "./HostLive"
