// @effect-diagnostics-next-line nodeBuiltinImport:off
import { createHash } from "node:crypto"

import { Db } from "@pp/db"
import {
  attachmentIndex,
  attachmentReference,
  commentIndex,
  jiraIdentityClaim,
  jiraMigration,
  member,
  organization,
  projectGitAutomation,
  projectIndex,
  projectMember,
  projectStatus,
  projectTag,
  ticketIndex,
  user as userTable
} from "@pp/db/schema"
import type * as Client from "@pp/integration-jira/Client"
import { groupBy } from "@pp/integration-jira/collections"
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
import { and, eq, inArray, sql as drizzleSql } from "drizzle-orm"
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
      key: projectIndex.key,
      organizationId: projectIndex.organizationId
    })
    .from(projectIndex)
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

export const classifyMaterializationError = (
  error: unknown
): JiraMigrationWorkflowFailureValue => {
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

const INSERT_CHUNK_ROWS = 500

const chunksOf = <A>(
  rows: ReadonlyArray<A>
): ReadonlyArray<ReadonlyArray<A>> => {
  const chunks: Array<ReadonlyArray<A>> = []
  for (let offset = 0; offset < rows.length; offset += INSERT_CHUNK_ROWS)
    chunks.push(rows.slice(offset, offset + INSERT_CHUNK_ROWS))
  return chunks
}

const insertChunked = <A, B, E, R>(
  rows: ReadonlyArray<A>,
  insert: (rows: Array<A>) => Effect.Effect<B, E, R>
) =>
  Effect.forEach(chunksOf(rows), (chunk) => insert([...chunk]), {
    discard: true
  })

export const jiraMigrationResult = (
  plan: JiraPublicationPlanV1,
  checkpoint: MigrationProjection.JiraMigrationCheckpoint
): JiraMigrationResult => {
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
  }
}

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

export const publishJiraMigrationAtomically = Effect.fn(
  "JiraImport.publishAtomically"
)(function* (input: JiraAtomicPublicationInput) {
  const db = yield* Db
  const { fence, plan, verified } = input
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
  return yield* Effect.uninterruptible(
    db.transaction((tx) =>
      Effect.gen(function* () {
        const [migration] = yield* tx
          .select()
          .from(jiraMigration)
          .where(eq(jiraMigration.id, fence.migrationId))
          .for("update")
        const [project] = yield* tx
          .select()
          .from(projectIndex)
          .where(eq(projectIndex.id, plan.project.id))
          .for("update")
        if (
          !migration ||
          migration.workflowExecutionId !== fence.workflowExecutionId ||
          migration.workflowAttempt !== fence.workflowAttempt ||
          !project
        )
          return yield* new JiraPublicationInvalid({
            reasons: ["stale-publication-attempt"]
          })
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
            return true
          return yield* new JiraPublicationInvalid({
            reasons: ["publication-replay-conflict"]
          })
        }
        const plannedProject = plan.indexes.project
        if (
          migration.status !== "migrating" ||
          migration.cleanupExecutionId !== null ||
          checkpoint.remoteWritesMayStillCommit !== undefined ||
          project.publishedAt !== null ||
          project.organizationId !== migration.organizationId ||
          project.id !== plannedProject.id ||
          project.slug !== plannedProject.slug ||
          project.key !== plannedProject.key ||
          project.name !== plannedProject.name ||
          project.icon !== plannedProject.icon ||
          project.color !== plannedProject.color ||
          project.nextTicketNumber !== plannedProject.nextTicketNumber ||
          project.createdBy !== plannedProject.createdBy ||
          project.createdAt.toISOString() !== plannedProject.createdAt
        )
          return yield* new JiraPublicationInvalid({
            reasons: ["hidden-project-identity-conflict"]
          })
        const plannedMemberIds = [
          ...new Set(plan.indexes.members.map((row) => row.userId))
        ]
        if (plannedMemberIds.length > 0) {
          const orgMembers = yield* tx
            .select({ userId: member.userId })
            .from(member)
            .where(
              and(
                eq(member.organizationId, migration.organizationId),
                inArray(member.userId, plannedMemberIds)
              )
            )
            .for("share")
          if (orgMembers.length !== plannedMemberIds.length)
            return yield* new JiraPublicationInvalid({
              reasons: ["publication-member-conflict"]
            })
        }
        yield* insertChunked(
          plan.indexes.statuses.map((row) => ({
            ...row,
            description: baselineStatusDescription(row.slug),
            createdAt: toDate(row.createdAt)
          })),
          (rows) => tx.insert(projectStatus).values(rows)
        )
        const seededRules = GIT_AUTOMATION_SEED.filter((rule) =>
          plan.indexes.statuses.some((row) => row.slug === rule.statusSlug)
        )
        if (seededRules.length > 0)
          yield* tx.insert(projectGitAutomation).values(
            seededRules.map((rule) => ({
              projectId: plannedProject.id,
              event: rule.event,
              statusSlug: rule.statusSlug
            }))
          )
        yield* insertChunked(
          plan.indexes.tags.map((row) => ({
            ...row,
            createdAt: toDate(row.createdAt)
          })),
          (rows) => tx.insert(projectTag).values(rows)
        )
        yield* insertChunked(
          plan.indexes.members.map((row) => ({
            projectId: row.projectId,
            organizationId: migration.organizationId,
            userId: row.userId,
            roleId:
              row.role === "owner" ? ("pm" as const) : ("developer" as const),
            createdAt: toDate(row.createdAt)
          })),
          (rows) => tx.insert(projectMember).values(rows)
        )
        for (const invite of plan.invites ?? []) {
          yield* issueProjectInvite(db, {
            organizationId: migration.organizationId,
            orgSlug: plan.project.orgSlug,
            projectId: plannedProject.id,
            inviterId: migration.initiatedBy,
            email: invite.email,
            role: "developer"
          })
          yield* tx
            .insert(jiraIdentityClaim)
            .values({
              projectId: plannedProject.id,
              email: invite.email,
              jiraAccountIds: [...invite.sourceAccountIds],
              assigneeTicketIds: [...invite.assigneeTicketIds],
              reporterTicketIds: [...invite.reporterTicketIds]
            })
            .onConflictDoNothing()
        }
        yield* insertChunked(
          plan.indexes.tickets.map(
            ({ orgSlug: _orgSlug, projectSlug: _projectSlug, ...row }) => ({
              ...row,
              tags: [...row.tags],
              assignees: [...row.assignees],
              createdAt: toDate(row.createdAt),
              updatedAt: toDate(row.updatedAt)
            })
          ),
          (rows) => tx.insert(ticketIndex).values(rows)
        )
        yield* insertChunked(
          plan.indexes.comments.map(
            ({ projectSlug: _projectSlug, ...row }) => ({
              ...row,
              projectId: plannedProject.id,
              createdAt: toDate(row.createdAt),
              editedAt: row.editedAt === null ? null : toDate(row.editedAt)
            })
          ),
          (rows) => tx.insert(commentIndex).values(rows)
        )
        yield* insertChunked(
          plan.indexes.attachmentReferences.map(
            ({ orgSlug: _orgSlug, projectSlug: _projectSlug, ...row }) => ({
              ...row,
              projectId: plannedProject.id,
              createdAt: toDate(row.createdAt)
            })
          ),
          (rows) => tx.insert(attachmentReference).values(rows)
        )
        for (const plannedChunk of chunksOf(plan.indexes.attachments)) {
          const pendingRows = yield* tx
            .select()
            .from(attachmentIndex)
            .where(
              inArray(
                attachmentIndex.id,
                plannedChunk.map(({ id }) => id)
              )
            )
            .for("update")
          const pendingById = new Map(pendingRows.map((row) => [row.id, row]))
          const conflicting = plannedChunk.some((planned) => {
            const pending = pendingById.get(planned.id)
            return (
              !pending ||
              pending.status !== "pending" ||
              pending.organizationId !== planned.organizationId ||
              pending.orgSlug !== planned.orgSlug ||
              pending.projectId !== plannedProject.id ||
              pending.ticketId !== planned.ticketId ||
              pending.objectKey !== planned.objectKey ||
              pending.filename !== planned.filename ||
              pending.contentType !== planned.contentType ||
              pending.byteSize !== planned.byteSize ||
              pending.contentHash !== planned.contentHash ||
              pending.uploadedBy !== planned.uploadedBy ||
              pending.createdAt.toISOString() !== planned.createdAt
            )
          })
          if (conflicting)
            return yield* new JiraPublicationInvalid({
              reasons: ["attachment-identity-conflict"]
            })
          for (const [committedAt, ids] of groupBy(
            plannedChunk,
            (planned) => planned.committedAt,
            (planned) => planned.id
          ))
            yield* tx
              .update(attachmentIndex)
              .set({ status: "live", committedAt: toDate(committedAt) })
              .where(inArray(attachmentIndex.id, ids))
        }
        const now = yield* DateTime.nowAsDate
        const published = yield* tx
          .update(projectIndex)
          .set({
            publishedAt: now,
            estimation: plannedProject.estimation ?? "off"
          })
          .where(
            and(
              eq(projectIndex.id, project.id),
              drizzleSql`${projectIndex.publishedAt} is null`
            )
          )
          .returning({ id: projectIndex.id })
        if (published.length !== 1)
          return yield* new JiraPublicationInvalid({
            reasons: ["publication-race-lost"]
          })
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
        return true
      })
    )
  )
})

export type HiddenJiraProjectInput = Readonly<{
  fence: MigrationProjection.AttemptFence
  project: Readonly<{
    id: string
    organizationId: string
    slug: string
    key: string
    name: string
    icon: string
    color: string
    nextTicketNumber: number
    createdBy: string
    createdAt: string
  }>
}>

export const ensureHiddenJiraProject = Effect.fn(
  "JiraImport.ensureHiddenProject"
)(function* (input: HiddenJiraProjectInput) {
  const db = yield* Db
  const { fence, project } = input
  return yield* db.transaction((tx) =>
    Effect.gen(function* () {
      const [migration] = yield* tx
        .select({
          workflowExecutionId: jiraMigration.workflowExecutionId,
          workflowAttempt: jiraMigration.workflowAttempt,
          status: jiraMigration.status,
          cleanupExecutionId: jiraMigration.cleanupExecutionId,
          organizationId: jiraMigration.organizationId,
          destinationProjectId: jiraMigration.destinationProjectId,
          destinationProjectSlug: jiraMigration.destinationProjectSlug
        })
        .from(jiraMigration)
        .where(eq(jiraMigration.id, fence.migrationId))
        .for("update")
      if (
        !migration ||
        migration.workflowExecutionId !== fence.workflowExecutionId ||
        migration.workflowAttempt !== fence.workflowAttempt ||
        migration.status !== "migrating" ||
        migration.cleanupExecutionId !== null ||
        migration.organizationId !== project.organizationId ||
        (migration.destinationProjectId !== null &&
          migration.destinationProjectId !== project.id) ||
        (migration.destinationProjectSlug !== null &&
          migration.destinationProjectSlug !== project.slug)
      )
        return yield* new JiraPublicationInvalid({
          reasons: ["stale-materialization-attempt"]
        })
      yield* tx
        .insert(projectIndex)
        .values({
          ...project,
          createdAt: DateTime.toDate(DateTime.makeUnsafe(project.createdAt)),
          banner: null,
          iconImage: null,
          publishedAt: null
        })
        .onConflictDoNothing()
      const [existing] = yield* tx
        .select()
        .from(projectIndex)
        .where(
          and(
            eq(projectIndex.organizationId, project.organizationId),
            eq(projectIndex.slug, project.slug)
          )
        )
        .limit(1)
      if (
        !existing ||
        existing.id !== project.id ||
        existing.organizationId !== project.organizationId ||
        existing.key !== project.key ||
        existing.name !== project.name ||
        existing.icon !== project.icon ||
        existing.color !== project.color ||
        existing.nextTicketNumber !== project.nextTicketNumber ||
        existing.createdBy !== project.createdBy ||
        existing.createdAt.toISOString() !== project.createdAt ||
        existing.banner !== null ||
        existing.iconImage !== null ||
        existing.publishedAt !== null
      )
        return yield* new JiraPublicationInvalid({
          reasons: ["hidden-project-identity-conflict"]
        })
      yield* tx
        .update(jiraMigration)
        .set({
          destinationProjectId: project.id,
          destinationProjectSlug: project.slug
        })
        .where(eq(jiraMigration.id, fence.migrationId))
      return existing.id
    })
  )
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
  const db = yield* Db
  const markdown = yield* Markdown.Markdown
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  if (
    new Set(input.documents.map(({ path }) => path)).size !==
    input.documents.length
  )
    return yield* new JiraPublicationInvalid({
      reasons: ["duplicate-document-path"]
    })
  for (const document of input.documents) {
    if (
      !safeJiraDocumentPath(document.path, input.fence.migrationId) ||
      createHash("sha256").update(document.content).digest("hex") !==
        document.sha256
    )
      return yield* new JiraPublicationInvalid({
        reasons: ["invalid-document-content-or-path"]
      })
  }
  return yield* Effect.uninterruptible(
    db.transaction((tx) =>
      Effect.gen(function* () {
        const [migration] = yield* tx
          .select()
          .from(jiraMigration)
          .where(eq(jiraMigration.id, input.fence.migrationId))
          .for("update")
        const [project] = yield* tx
          .select()
          .from(projectIndex)
          .where(eq(projectIndex.id, input.projectId))
          .limit(1)
        const [org] = project
          ? yield* tx
              .select({ slug: organization.slug })
              .from(organization)
              .where(eq(organization.id, project.organizationId))
              .limit(1)
          : []
        if (
          !migration ||
          migration.workflowExecutionId !== input.fence.workflowExecutionId ||
          migration.workflowAttempt !== input.fence.workflowAttempt ||
          migration.status !== "migrating" ||
          migration.cleanupExecutionId !== null ||
          !project ||
          project.publishedAt !== null ||
          project.slug !== input.projectSlug ||
          project.organizationId !== migration.organizationId ||
          org?.slug !== input.orgSlug
        )
          return yield* new JiraPublicationInvalid({
            reasons: ["stale-materialization-attempt"]
          })
        const directory = markdown.projectDir(input.orgSlug, input.projectSlug)
        for (const document of input.documents) {
          const target = path.join(directory, document.path)
          yield* fs.makeDirectory(path.dirname(target), { recursive: true })
          const temporary = `${target}.jira-tmp`
          yield* fs.writeFileString(temporary, document.content)
          yield* fs.rename(temporary, target)
          const stored = yield* fs.readFileString(target)
          if (
            createHash("sha256").update(stored).digest("hex") !==
            document.sha256
          )
            return yield* new JiraPublicationInvalid({
              reasons: ["document-verification-failed"]
            })
        }
        return input.documents.length
      })
    )
  )
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
  const attemptIsCurrent = db.transaction((tx) =>
    Effect.gen(function* () {
      const [migration] = yield* tx
        .select()
        .from(jiraMigration)
        .where(eq(jiraMigration.id, fence.migrationId))
        .for("update")
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
        !migration ||
        migration.workflowExecutionId !== fence.workflowExecutionId ||
        migration.workflowAttempt !== fence.workflowAttempt ||
        migration.status !== "migrating" ||
        migration.cleanupExecutionId !== null ||
        migration.organizationId !== input.organizationId ||
        !project ||
        project.publishedAt !== null ||
        project.organizationId !== input.organizationId ||
        project.slug !== input.projectSlug ||
        org?.slug !== input.orgSlug
      )
        return null
      const checkpoint = yield* MigrationProjection.decodeCheckpoint(
        migration.checkpoint
      )
      return checkpoint.remoteWritesMayStillCommit?.workflowExecutionId ===
        fence.workflowExecutionId &&
        checkpoint.remoteWritesMayStillCommit.workflowAttempt ===
          fence.workflowAttempt
        ? migration.createdAt
        : null
    })
  )
  const migrationCreatedAt = yield* attemptIsCurrent
  if (migrationCreatedAt === null)
    return yield* new JiraPublicationInvalid({
      reasons: ["stale-materialization-attempt"]
    })
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
  return yield* db
    .transaction((tx) =>
      Effect.gen(function* () {
        const [migration] = yield* tx
          .select()
          .from(jiraMigration)
          .where(eq(jiraMigration.id, fence.migrationId))
          .for("update")
        const [project] = yield* tx
          .select()
          .from(projectIndex)
          .where(eq(projectIndex.id, input.projectId))
          .limit(1)
        const checkpoint = migration
          ? yield* MigrationProjection.decodeCheckpoint(migration.checkpoint)
          : null
        if (
          !migration ||
          migration.workflowExecutionId !== fence.workflowExecutionId ||
          migration.workflowAttempt !== fence.workflowAttempt ||
          migration.status !== "migrating" ||
          migration.cleanupExecutionId !== null ||
          migration.organizationId !== input.organizationId ||
          !project ||
          project.publishedAt !== null ||
          project.organizationId !== input.organizationId ||
          project.slug !== input.projectSlug ||
          checkpoint?.remoteWritesMayStillCommit?.workflowExecutionId !==
            fence.workflowExecutionId ||
          checkpoint.remoteWritesMayStillCommit.workflowAttempt !==
            fence.workflowAttempt
        )
          return yield* new JiraPublicationInvalid({
            reasons: ["stale-materialization-attempt"]
          })
        yield* tx
          .insert(attachmentIndex)
          .values({
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
            status: "pending",
            uploadedBy: input.uploadedBy,
            createdAt: migrationCreatedAt
          })
          .onConflictDoNothing()
        const [row] = yield* tx
          .select()
          .from(attachmentIndex)
          .where(eq(attachmentIndex.id, attachment.id))
          .limit(1)
        if (
          !row ||
          row.organizationId !== input.organizationId ||
          row.orgSlug !== input.orgSlug ||
          row.projectId !== input.projectId ||
          row.ticketId !== attachment.ticketId ||
          row.objectKey !== attachment.objectKey ||
          row.filename !== attachment.filename ||
          row.contentType !== attachment.contentType ||
          row.byteSize !== attachment.byteSize ||
          row.contentHash !== contentSha256 ||
          row.status !== "pending" ||
          row.uploadedBy !== input.uploadedBy ||
          row.createdAt.getTime() !== migrationCreatedAt.getTime()
        )
          return yield* new JiraPublicationInvalid({
            reasons: ["attachment-identity-conflict"]
          })
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
    )
    .pipe(
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
  const markdown = yield* Markdown.Markdown
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const [migration] = yield* db
    .select()
    .from(jiraMigration)
    .where(eq(jiraMigration.id, input.fence.migrationId))
    .limit(1)
  const [project] = yield* db
    .select()
    .from(projectIndex)
    .where(eq(projectIndex.id, input.projectId))
    .limit(1)
  if (
    !migration ||
    migration.workflowExecutionId !== input.fence.workflowExecutionId ||
    migration.workflowAttempt !== input.fence.workflowAttempt ||
    migration.status !== "migrating" ||
    migration.cleanupExecutionId !== null ||
    !project ||
    project.organizationId !== migration.organizationId ||
    project.slug !== input.projectSlug ||
    project.publishedAt !== null
  )
    return yield* new JiraPublicationInvalid({
      reasons: ["stale-materialization-attempt"]
    })
  const checkpoint = yield* MigrationProjection.decodeCheckpoint(
    migration.checkpoint
  )
  if (
    checkpoint.remoteWritesMayStillCommit?.workflowExecutionId !==
      input.fence.workflowExecutionId ||
    checkpoint.remoteWritesMayStillCommit.workflowAttempt !==
      input.fence.workflowAttempt
  )
    return yield* new JiraPublicationInvalid({
      reasons: ["stale-materialization-attempt"]
    })
  const [org] = yield* db
    .select({ slug: organization.slug })
    .from(organization)
    .where(eq(organization.id, project.organizationId))
    .limit(1)
  if (org?.slug !== input.orgSlug)
    return yield* new JiraPublicationInvalid({
      reasons: ["hidden-project-identity-conflict"]
    })
  const allDocuments = [
    ...input.documents,
    input.archiveDocument,
    input.reportDocument
  ]
  if (
    new Set(allDocuments.map(({ path }) => path)).size !== allDocuments.length
  )
    return yield* new JiraPublicationInvalid({
      reasons: ["duplicate-document-path"]
    })
  const directory = markdown.projectDir(input.orgSlug, input.projectSlug)
  let unresolvedReferenceCount = 0
  for (const document of allDocuments) {
    if (!safeJiraDocumentPath(document.path, input.fence.migrationId))
      return yield* new JiraPublicationInvalid({
        reasons: ["invalid-document-content-or-path"]
      })
    const stored = yield* fs
      .readFileString(path.join(directory, document.path))
      .pipe(
        Effect.mapError(
          () => new JiraPublicationInvalid({ reasons: ["missing-document"] })
        )
      )
    if (createHash("sha256").update(stored).digest("hex") !== document.sha256)
      return yield* new JiraPublicationInvalid({
        reasons: ["document-verification-failed"]
      })
    unresolvedReferenceCount += (stored.match(/\uE000jira-reference:/g) ?? [])
      .length
  }
  if (unresolvedReferenceCount !== 0)
    return yield* new JiraPublicationInvalid({
      reasons: ["unresolved-document-references"]
    })
  const copied = input.attachments.filter(
    (attachment) => attachment.kind === "copied"
  )
  if (
    new Set(copied.map(({ attachmentId }) => attachmentId)).size !==
    copied.length
  )
    return yield* new JiraPublicationInvalid({
      reasons: ["duplicate-attachment-outcome"]
    })
  for (const attachment of copied) {
    const [row] = yield* db
      .select()
      .from(attachmentIndex)
      .where(eq(attachmentIndex.id, attachment.attachmentId))
      .limit(1)
    const head = yield* s3.headObject(input.connection, attachment.objectKey)
    const bytes = yield* s3.getObject(input.connection, attachment.objectKey)
    if (
      !row ||
      row.organizationId !== migration.organizationId ||
      row.orgSlug !== input.orgSlug ||
      row.projectId !== input.projectId ||
      row.objectKey !== attachment.objectKey ||
      row.byteSize !== attachment.byteSize ||
      row.contentType !== attachment.contentType ||
      row.contentHash !== attachment.contentSha256 ||
      row.status !== "pending" ||
      !head ||
      head.byteSize !== attachment.byteSize ||
      head.contentType !== attachment.contentType ||
      !bytes ||
      bytes.length !== attachment.byteSize ||
      createHash("sha256").update(bytes).digest("hex") !==
        attachment.contentSha256
    )
      return yield* new JiraPublicationInvalid({
        reasons: ["attachment-verification-failed"]
      })
  }
  return {
    planSha256: input.planSha256,
    documentCount: allDocuments.length,
    attachmentCount: copied.length,
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
