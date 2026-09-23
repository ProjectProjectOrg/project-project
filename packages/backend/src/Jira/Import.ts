import { createHash } from "node:crypto"
import { and, eq, inArray, sql as drizzleSql } from "drizzle-orm"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Path from "effect/Path"
import * as Predicate from "effect/Predicate"
import * as Schema from "effect/Schema"
import { ulid } from "ulid"
import * as Stream from "effect/Stream"
import {
  attachmentUrl,
  BASELINE_STATUS_SEED,
  deriveProjectIdentity,
  GroupColor,
  GroupId,
  JiraMigrationConfiguration,
  pickStatusColor,
  ProjectKey,
  StatusSlug,
  TagName,
  TicketId
} from "@projectproject/shared"
import { generateKeyBetween } from "fractional-indexing"
import {
  attachmentIndex,
  attachmentReference,
  commentIndex,
  jiraMigration,
  organization,
  projectIndex,
  projectMember,
  projectStatus,
  projectTag,
  ticketIndex,
  user as userTable
} from "../db/schema"
import { serializeCommentsRegion, type CommentBlock } from "../comments-region"
import { JiraMigrationBlocked } from "./Blocked"
import { Db } from "../Services/Db"
import { Markdown } from "../Services/Markdown"
import {
  attachmentObjectKey,
  type S3Connection,
  type S3StorageShape
} from "../Services/S3Storage"
import type { AttachmentsShape } from "../Services/Attachments"
import type { GroupDocsShape } from "../Services/GroupDocs"
import type { ProjectDocsShape } from "../Services/ProjectDocs"
import type { TicketDocsShape } from "../Services/TicketDocs"
import type { TicketIndexShape } from "../Services/TicketIndex"
import type { JiraClientShape } from "./Client"
import { jiraConfigurationToMappings } from "./Mappings"
import {
  canonicalJiraJson,
  JiraMigrationManifestV2,
  type JiraManifestAttachment,
  type JiraMigrationManifest
} from "./Manifest"
import { JiraProject } from "./ClientSchemas"
import { convertAdfToMarkdown } from "./Adf"
import {
  preflightJiraMigration,
  JiraPublicationInvalid,
  type JiraPreflightEnvironment
} from "./Preflight"
import {
  decodeCheckpoint,
  JiraMigrationCheckpoint,
  type AttemptFence
} from "./MigrationProjection"
import { jiraDocumentBatches } from "./MigrationActivities"
import { JiraMigrationWorkflowFailure } from "./MigrationWorkflow"
import type {
  JiraArtifactRef,
  JiraMigrationArtifactsShape
} from "./MigrationArtifacts"
import { artifactKey } from "./MigrationArtifacts"
import {
  createJiraPublicationPlan,
  finalizeJiraPublication,
  jiraProjectIdFor,
  JiraPreparedPublicationV1,
  JiraPublicationPlanV1,
  JiraResolvedSource,
  prepareJiraPublication,
  type JiraAttachmentOutcome,
  type JiraPublicationPlan
} from "./PublicationPlan"

export type JiraImportBlocked = {
  readonly kind: "blocked"
  readonly blockers: ReadonlyArray<{
    readonly code: string
    readonly subject: string
  }>
}

export type JiraImportPublished = {
  readonly kind: "published"
  readonly projectSlug: string
  readonly ticketCount: number
  readonly commentCount: number
  readonly groupCount: number
}

export type JiraImportResult = JiraImportBlocked | JiraImportPublished

const decodeConfiguration = Schema.decodeUnknownSync(JiraMigrationConfiguration)
const decodeProjectKey = Schema.decodeUnknownSync(ProjectKey)
const decodeGroupId = Schema.decodeUnknownSync(GroupId)
const decodeGroupColor = Schema.decodeUnknownSync(GroupColor)
const decodeTicketId = Schema.decodeUnknownSync(TicketId)
const decodeTagName = Schema.decodeUnknownSync(TagName)
const decodeStatusSlug = Schema.decodeUnknownSync(StatusSlug)

const toDate = (iso: string) => DateTime.toDate(DateTime.makeUnsafe(iso))

const SPRINT_GROUP_COLOR = "#777777"

export const groupColors = (
  groups: JiraPublicationPlan["groups"]
): ReadonlyArray<string> => {
  const used: Array<string> = []
  return groups.map((group) => {
    if (group.kind === "sprint") return SPRINT_GROUP_COLOR
    const color = pickStatusColor(used)
    used.push(color)
    return color
  })
}

export const buildJiraImportContext = (
  manifest: JiraMigrationManifest,
  rawConfiguration: unknown,
  environment: JiraPreflightEnvironment,
  attachmentUrlsBySourceId: Readonly<Record<string, string>>
) => {
  const configuration = decodeConfiguration(rawConfiguration)
  const mappings = jiraConfigurationToMappings(manifest, configuration)
  const preflight = preflightJiraMigration(manifest, mappings, environment)
  const result = createJiraPublicationPlan(
    manifest,
    mappings,
    preflight,
    attachmentUrlsBySourceId
  )
  return { mappings, preflight, result }
}

export const buildJiraImportPlan = (
  manifest: JiraMigrationManifest,
  rawConfiguration: unknown,
  environment: JiraPreflightEnvironment,
  attachmentUrlsBySourceId: Readonly<Record<string, string>>
) =>
  buildJiraImportContext(
    manifest,
    rawConfiguration,
    environment,
    attachmentUrlsBySourceId
  ).result

export const resolveJiraPublicationSource = Effect.fn(
  "JiraImport.resolvePublicationSource"
)(function* (
  orgSlug: string,
  manifest: JiraMigrationManifestV2,
  artifacts: Pick<JiraMigrationArtifactsShape, "readJson">
) {
  const refs = [
    ...manifest.rawArtifacts,
    ...manifest.issues.flatMap((issue) =>
      issue.descriptionArtifact === null ? [] : [issue.descriptionArtifact]
    ),
    ...manifest.comments.map((comment) => comment.bodyArtifact),
    ...manifest.worklogs.flatMap((worklog) =>
      worklog.bodyArtifact === null ? [] : [worklog.bodyArtifact]
    ),
    ...manifest.attachments.map((attachment) => attachment.metadataArtifact),
    ...manifest.customFields.map((field) => field.valuesArtifact)
  ]
  const unique = [...new Map(refs.map((ref) => [ref.key, ref])).values()]
  const resolved = yield* Effect.forEach(unique, (ref) =>
    artifacts
      .readJson(orgSlug, ref, Schema.Json)
      .pipe(Effect.map((value) => ({ ref, value })))
  )
  const projectRefs = manifest.rawArtifacts.filter((ref) =>
    ref.key.includes("/raw/project/")
  )
  if (projectRefs.length > 1)
    return yield* new JiraPublicationInvalid({
      reasons: ["multiple-project-source-artifacts"]
    })
  const projectRaw = projectRefs[0]
  const project = projectRaw
    ? yield* Schema.decodeUnknownEffect(JiraProject)(
        resolved.find(({ ref }) => ref.key === projectRaw.key)?.value
      ).pipe(
        Effect.mapError(
          () =>
            new JiraPublicationInvalid({
              reasons: ["invalid-project-source-artifact"]
            })
        )
      )
    : null
  const description = project?.description
  const projectDescription =
    description === null || description === undefined
      ? null
      : Predicate.isString(description)
        ? {
            markdown: description,
            warnings: [],
            references: [],
            adf: description
          }
        : { ...convertAdfToMarkdown(description), adf: description }
  return yield* Schema.decodeUnknownEffect(JiraResolvedSource)({
    projectDescription,
    artifacts: resolved
  }).pipe(
    Effect.mapError(
      () =>
        new JiraPublicationInvalid({
          reasons: ["invalid-resolved-source-artifact"]
        })
    )
  )
})

export type JiraPublicationSnapshotInput = Readonly<{
  fence: AttemptFence
  manifestRef: JiraArtifactRef
  configurationRevision: number
  configuration: JiraMigrationConfiguration
  migrationCreatedAt: string
  organizationId: string
  orgSlug: string
  ownerId: string
  connection: S3Connection
}>

export const prepareJiraPublicationFromSnapshot = Effect.fn(
  "JiraImport.prepareFromSnapshot"
)(function* (
  input: JiraPublicationSnapshotInput,
  artifacts: Pick<JiraMigrationArtifactsShape, "readJson" | "writeJson">
) {
  const db = yield* Db
  const manifest = yield* artifacts.readJson(
    input.orgSlug,
    input.manifestRef,
    JiraMigrationManifestV2
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
  const linkedUserIds = new Set([
    input.ownerId,
    ...input.configuration.identities.flatMap((identity) =>
      identity.projectProjectUserId === null
        ? []
        : [identity.projectProjectUserId]
    )
  ])
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
      })),
    environment: {
      existingProjectSlugs: projects
        .filter((project) => project.id !== projectId)
        .map((project) => project.slug),
      existingProjectKeys: projects
        .filter(
          (project) =>
            project.organizationId === input.organizationId &&
            project.id !== projectId
        )
        .map((project) => project.key),
      existingTicketIds: tickets
        .filter((ticket) => ticket.projectId !== projectId)
        .map((ticket) => ticket.ticketId),
      existingUserIds: allUsers.map((user) => user.id),
      existingStatusSlugs: BASELINE_STATUS_SEED.map((status) => status.slug)
    },
    source
  })
  return yield* persistJiraPreparedPublication(prepared, artifacts)
})

export const persistJiraPreparedPublication = Effect.fn(
  "JiraImport.persistPreparedPublication"
)(function* (
  prepared: JiraPreparedPublicationV1,
  artifacts: Pick<JiraMigrationArtifactsShape, "writeJson">
) {
  const encoded = yield* Schema.encodeEffect(JiraPreparedPublicationV1)(
    prepared
  )
  const identity = createHash("sha256")
    .update(canonicalJiraJson(encoded))
    .digest("hex")
  return yield* artifacts.writeJson(
    prepared.orgSlug,
    {
      migrationId: prepared.manifest.migrationId,
      scanRevision: prepared.manifest.scanRevision,
      area: "publication",
      kind: "prepared-v1",
      identity
    },
    prepared
  )
})

export const loadJiraPreparedPublication = Effect.fn(
  "JiraImport.loadPreparedPublication"
)(function* (
  orgSlug: string,
  ref: JiraArtifactRef,
  artifacts: Pick<JiraMigrationArtifactsShape, "verify" | "readJson">
) {
  yield* artifacts.verify(orgSlug, ref)
  const prepared = yield* artifacts.readJson(
    orgSlug,
    ref,
    JiraPreparedPublicationV1
  )
  if (prepared.orgSlug !== orgSlug)
    return yield* new JiraPublicationInvalid({
      reasons: ["prepared-publication-org-conflict"]
    })
  return prepared
})

export const persistJiraPublicationPlan = Effect.fn(
  "JiraImport.persistPublicationPlan"
)(function* (
  prepared: JiraPreparedPublicationV1,
  outcomes: ReadonlyArray<JiraAttachmentOutcome>,
  artifacts: Pick<JiraMigrationArtifactsShape, "writeJson">
) {
  const finalized = yield* finalizeJiraPublication(prepared, outcomes)
  const planRef = yield* artifacts.writeJson(
    prepared.orgSlug,
    {
      migrationId: prepared.manifest.migrationId,
      scanRevision: prepared.manifest.scanRevision,
      area: "publication",
      kind: "plan-v1",
      identity: finalized.publicationRevision
    },
    finalized.plan
  )
  return {
    planRef,
    publicationRevision: finalized.publicationRevision,
    documentBatchCount: jiraDocumentBatches(finalized.plan.documents).length
  }
})

export const loadJiraPublicationPlan = Effect.fn(
  "JiraImport.loadPublicationPlan"
)(function* (
  orgSlug: string,
  ref: JiraArtifactRef,
  artifacts: Pick<JiraMigrationArtifactsShape, "verify" | "readJson">
) {
  yield* artifacts.verify(orgSlug, ref)
  const plan = yield* artifacts.readJson(orgSlug, ref, JiraPublicationPlanV1)
  const encoded = yield* Schema.encodeEffect(JiraPublicationPlanV1)(plan)
  const publicationRevision = createHash("sha256")
    .update(canonicalJiraJson(encoded))
    .digest("hex")
  return { plan, publicationRevision }
})

export const verifyJiraPermanentArchive = Effect.fn(
  "JiraImport.verifyPermanentArchive"
)(function* (
  fence: AttemptFence,
  orgSlug: string,
  artifacts: Pick<JiraMigrationArtifactsShape, "readJson" | "verify">
) {
  const db = yield* Db
  const markdown = yield* Markdown
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
  const checkpoint = yield* decodeCheckpoint(migration.checkpoint)
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
  const { plan, publicationRevision } = yield* loadJiraPublicationPlan(
    orgSlug,
    checkpoint.publishedPlan.planRef,
    artifacts
  )
  if (
    plan.migrationId !== migration.id ||
    plan.project.id !== project.id ||
    plan.project.slug !== project.slug ||
    publicationRevision !== checkpoint.publishedPlan.publicationRevision ||
    !safeJiraDocumentPath(plan.archiveDocument.path, migration.id)
  )
    return yield* new JiraPublicationInvalid({
      reasons: ["published-archive-plan-conflict"]
    })
  const stored = yield* fs
    .readFileString(
      path.join(
        markdown.projectDir(orgSlug, project.slug),
        plan.archiveDocument.path
      )
    )
    .pipe(
      Effect.mapError(
        () => new JiraPublicationInvalid({ reasons: ["missing-archive"] })
      )
    )
  if (
    createHash("sha256").update(stored).digest("hex") !==
    plan.archiveDocument.sha256
  )
    return yield* new JiraPublicationInvalid({
      reasons: ["published-archive-checksum-conflict"]
    })
})

export const makeJiraMaterializationDependencies = (
  prepared: JiraPreparedPublicationV1,
  fence: AttemptFence,
  services: Readonly<{
    connection: S3Connection
    jira: Pick<JiraClientShape, "attachmentContent">
    s3: Pick<S3StorageShape, "getObject" | "putObject" | "headObject">
    artifacts: Pick<
      JiraMigrationArtifactsShape,
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
  const failure = (error: unknown) =>
    JiraMigrationWorkflowFailure.make({
      reason: Schema.is(JiraPublicationInvalid)(error)
        ? "jira_migration_publication_invalid"
        : "jira_migration_materialization_failed",
      retryable: !Schema.is(JiraPublicationInvalid)(error)
    })
  const mapFailure = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    effect.pipe(Effect.mapError(failure))
  const load = (ref: JiraArtifactRef) =>
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
        })
      ),
    finalizePlan: (outcomes: ReadonlyArray<JiraAttachmentOutcome>) =>
      mapFailure(
        persistJiraPublicationPlan(prepared, outcomes, services.artifacts)
      ),
    writeDocumentBatch: (ref: JiraArtifactRef, ordinal: number) =>
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
    writeArchive: (ref: JiraArtifactRef) =>
      mapFailure(
        Effect.gen(function* () {
          const { plan } = yield* load(ref)
          return yield* write([plan.archiveDocument])
        })
      ),
    writeReport: (ref: JiraArtifactRef) =>
      mapFailure(
        Effect.gen(function* () {
          const { plan } = yield* load(ref)
          return yield* write([plan.reportDocument])
        })
      ),
    verify: (ref: JiraArtifactRef) =>
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
      ref: JiraArtifactRef,
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

export type JiraAtomicPublicationInput = Readonly<{
  fence: AttemptFence
  planRef: JiraArtifactRef
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
  const encoded = yield* Schema.encodeEffect(JiraPublicationPlanV1)(plan)
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
        const checkpoint = yield* decodeCheckpoint(migration.checkpoint)
        if (
          input.planRef.key !==
          artifactKey({
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
        if (plan.indexes.statuses.length > 0)
          yield* tx.insert(projectStatus).values(
            plan.indexes.statuses.map((row) => ({
              ...row,
              createdAt: toDate(row.createdAt)
            }))
          )
        if (plan.indexes.tags.length > 0)
          yield* tx.insert(projectTag).values(
            plan.indexes.tags.map((row) => ({
              ...row,
              createdAt: toDate(row.createdAt)
            }))
          )
        if (plan.indexes.members.length > 0)
          yield* tx.insert(projectMember).values(
            plan.indexes.members.map((row) => ({
              ...row,
              createdAt: toDate(row.createdAt)
            }))
          )
        if (plan.indexes.tickets.length > 0)
          yield* tx.insert(ticketIndex).values(
            plan.indexes.tickets.map((row) => ({
              ...row,
              tags: [...row.tags],
              assignees: [...row.assignees],
              createdAt: toDate(row.createdAt),
              updatedAt: toDate(row.updatedAt)
            }))
          )
        if (plan.indexes.comments.length > 0)
          yield* tx.insert(commentIndex).values(
            plan.indexes.comments.map((row) => ({
              ...row,
              createdAt: toDate(row.createdAt),
              editedAt: row.editedAt === null ? null : toDate(row.editedAt)
            }))
          )
        if (plan.indexes.attachmentReferences.length > 0)
          yield* tx.insert(attachmentReference).values(
            plan.indexes.attachmentReferences.map((row) => ({
              ...row,
              createdAt: toDate(row.createdAt)
            }))
          )
        for (const planned of plan.indexes.attachments) {
          const [pending] = yield* tx
            .select()
            .from(attachmentIndex)
            .where(eq(attachmentIndex.id, planned.id))
            .for("update")
          if (
            !pending ||
            pending.status !== "pending" ||
            pending.organizationId !== planned.organizationId ||
            pending.orgSlug !== planned.orgSlug ||
            pending.projectSlug !== planned.projectSlug ||
            pending.ticketId !== planned.ticketId ||
            pending.objectKey !== planned.objectKey ||
            pending.filename !== planned.filename ||
            pending.contentType !== planned.contentType ||
            pending.byteSize !== planned.byteSize ||
            pending.contentHash !== planned.contentHash ||
            pending.uploadedBy !== planned.uploadedBy ||
            pending.createdAt.toISOString() !== planned.createdAt
          )
            return yield* new JiraPublicationInvalid({
              reasons: ["attachment-identity-conflict"]
            })
          yield* tx
            .update(attachmentIndex)
            .set({
              status: "live",
              committedAt: toDate(planned.committedAt)
            })
            .where(eq(attachmentIndex.id, planned.id))
        }
        const now = yield* DateTime.nowAsDate
        const published = yield* tx
          .update(projectIndex)
          .set({ publishedAt: now })
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
            phase: "succeeded",
            destinationProjectId: project.id,
            destinationProjectSlug: project.slug,
            reportPath: plan.reportDocument.path,
            checkpoint: yield* Schema.encodeEffect(JiraMigrationCheckpoint)({
              ...checkpoint,
              publishedPlan: {
                planRef: input.planRef,
                publicationRevision: input.publicationRevision
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
  fence: AttemptFence
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
        .where(eq(projectIndex.slug, project.slug))
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
  fence: AttemptFence
  projectId: string
  orgSlug: string
  projectSlug: string
  documents: JiraPublicationPlanV1["documents"]
}>

const safeJiraDocumentPath = (relative: string, migrationId: string) =>
  relative === "project.md" ||
  /^(tickets|groups)\/[A-Za-z0-9_-]+\.md$/.test(relative) ||
  relative === `imports/jira/${migrationId}/archive.json` ||
  relative === `imports/jira/${migrationId}/report.md`

export const writeJiraHiddenDocuments = Effect.fn(
  "JiraImport.writeHiddenDocuments"
)(function* (input: JiraHiddenDocumentsInput) {
  const db = yield* Db
  const markdown = yield* Markdown
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
  fence: AttemptFence
  projectId: string
  organizationId: string
  orgSlug: string
  projectSlug: string
  uploadedBy: string
  cloudId: string
  connection: S3Connection
  attachment: JiraPreparedPublicationV1["attachments"][number]
}>

export const copyJiraPreparedAttachment = Effect.fn(
  "JiraImport.copyPreparedAttachment"
)(function* (
  jira: Pick<JiraClientShape, "attachmentContent">,
  s3: Pick<S3StorageShape, "getObject" | "putObject">,
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
      const checkpoint = yield* decodeCheckpoint(migration.checkpoint)
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
  return yield* db.transaction((tx) =>
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
        ? yield* decodeCheckpoint(migration.checkpoint)
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
          projectSlug: input.projectSlug,
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
        row.projectSlug !== input.projectSlug ||
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
})

export type JiraHiddenVerificationInput = Readonly<{
  fence: AttemptFence
  projectId: string
  orgSlug: string
  projectSlug: string
  planSha256: string
  documents: JiraPublicationPlanV1["documents"]
  archiveDocument: JiraPublicationPlanV1["archiveDocument"]
  reportDocument: JiraPublicationPlanV1["reportDocument"]
  attachments: JiraPublicationPlanV1["attachments"]
  connection: S3Connection
}>

export const verifyJiraHiddenMaterialization = Effect.fn(
  "JiraImport.verifyHiddenMaterialization"
)(function* (
  s3: Pick<S3StorageShape, "getObject" | "headObject">,
  input: JiraHiddenVerificationInput
) {
  const db = yield* Db
  const markdown = yield* Markdown
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
  const checkpoint = yield* decodeCheckpoint(migration.checkpoint)
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
      row.projectSlug !== input.projectSlug ||
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

const commentBlocksFor = (
  plan: JiraPublicationPlan,
  ticketId: string
): ReadonlyArray<CommentBlock> =>
  plan.comments
    .filter((comment) => comment.ticketId === ticketId)
    .map((comment) => ({
      id: comment.sourceCommentId.startsWith("c_")
        ? comment.sourceCommentId
        : `c_jira_${comment.sourceCommentId}`,
      author: comment.author,
      origin: "jira" as const,
      createdAt: toDate(comment.createdAt),
      editedAt: comment.editedAt === null ? null : toDate(comment.editedAt),
      body: comment.body
    }))

export interface JiraImportDependencies {
  readonly db: Db["Service"]
  readonly projectDocs: ProjectDocsShape
  readonly ticketDocs: TicketDocsShape
  readonly groupDocs: GroupDocsShape
  readonly ticketIndex: TicketIndexShape
}

export const writeJiraStagedDocuments = Effect.fn("JiraImport.writeDocuments")(
  function* (
    deps: JiraImportDependencies,
    orgSlug: string,
    ownerId: string,
    plan: JiraPublicationPlan,
    members: ReadonlyArray<JiraImportMember>
  ) {
    const now = yield* DateTime.nowAsDate
    const identity = deriveProjectIdentity(plan.project.slug)
    yield* deps.projectDocs.write(orgSlug, plan.project.slug, {
      org: orgSlug,
      slug: plan.project.slug,
      key: decodeProjectKey(plan.project.key),
      name: plan.project.name,
      icon: identity.icon,
      color: identity.color,
      createdBy: ownerId,
      createdAt: now,
      members: members.map(({ username, role }) => ({ username, role })),
      github: null,
      setup: {
        workflowReviewedAt: null,
        invitePeopleDismissedAt: null,
        connectGithubDismissedAt: null
      },
      body:
        plan.project.body.trim() === ""
          ? `# ${plan.project.name}
`
          : plan.project.body
    })

    yield* Effect.forEach(
      plan.tickets,
      (ticket) => {
        const document = {
          id: decodeTicketId(ticket.id),
          title: ticket.title,
          status: decodeStatusSlug(ticket.status),
          type: ticket.type,
          priority: ticket.priority,
          tags: ticket.tags.map((tag) => decodeTagName(tag)),
          branch: null,
          pr: null,
          prState: null,
          lastTransitionedPr: null,
          assignees: ticket.assignees,
          archivedAt: null,
          createdBy: ownerId,
          updatedBy: ownerId,
          createdAt: toDate(ticket.createdAt),
          updatedAt: toDate(ticket.updatedAt),
          body: ticket.body,
          commentsRegion: serializeCommentsRegion(
            commentBlocksFor(plan, ticket.id)
          )
        }
        return deps.ticketDocs
          .create(orgSlug, plan.project.slug, document)
          .pipe(
            Effect.catchTag("TicketIdTaken", () =>
              deps.ticketDocs.write(
                orgSlug,
                plan.project.slug,
                ticket.id,
                document
              )
            )
          )
      },
      { concurrency: 8, discard: true }
    )

    const colors = groupColors(plan.groups)
    yield* Effect.forEach(
      plan.groups.map((group, index) => ({ group, index })),
      ({ group, index }) => {
        const id = decodeGroupId(`G-${index + 1}`)
        const document = {
          id,
          name: group.name,
          kind: group.kind,
          tickets: group.ticketIds.map((ticketId) => decodeTicketId(ticketId)),
          color: decodeGroupColor(colors[index] ?? SPRINT_GROUP_COLOR),
          startsAt: group.startsAt === null ? null : toDate(group.startsAt),
          endsAt: group.endsAt === null ? null : toDate(group.endsAt),
          completedAt:
            group.completedAt === null ? null : toDate(group.completedAt),
          createdBy: ownerId,
          createdAt: now,
          updatedAt: now,
          body: group.body
        }
        return deps.groupDocs
          .create(orgSlug, plan.project.slug, document)
          .pipe(
            Effect.catchTag("GroupIdTaken", () =>
              deps.groupDocs.write(orgSlug, plan.project.slug, id, document)
            )
          )
      },
      { concurrency: 4, discard: true }
    )
  }
)

export const publishJiraMigration = Effect.fn("JiraImport.publish")(function* (
  deps: JiraImportDependencies,
  input: {
    readonly migrationId: string
    readonly organizationId: string
    readonly orgSlug: string
    readonly ownerId: string
    readonly leaseId: string
    readonly reportPath: string
    readonly priorDestinationProjectId: string | null
    readonly plan: JiraPublicationPlan
    readonly members: ReadonlyArray<JiraImportMember>
  }
) {
  const now = yield* DateTime.nowAsDate
  const identity = deriveProjectIdentity(input.plan.project.slug)
  const publication = yield* deps.db
    .transaction((tx) =>
      Effect.gen(function* () {
        const existing = yield* tx
          .select({ id: projectIndex.id })
          .from(projectIndex)
          .where(eq(projectIndex.slug, input.plan.project.slug))
          .limit(1)
        const claimed = existing[0]
        if (claimed && claimed.id !== input.priorDestinationProjectId) {
          return "slug-taken" as const
        }
        const inserted = claimed
          ? [claimed]
          : yield* tx
              .insert(projectIndex)
              .values({
                slug: input.plan.project.slug,
                organizationId: input.organizationId,
                key: input.plan.project.key,
                name: input.plan.project.name,
                icon: identity.icon,
                color: identity.color,
                nextTicketNumber: nextTicketNumberFor(input.plan),
                createdBy: input.ownerId,
                createdAt: now
              })
              .returning({ id: projectIndex.id })

        const id = inserted[0]?.id
        if (!id) return yield* Effect.interrupt

        for (const baseline of BASELINE_STATUS_SEED) {
          yield* tx
            .insert(projectStatus)
            .values({
              projectId: id,
              slug: baseline.slug,
              label: baseline.label,
              icon: baseline.icon,
              color: baseline.color,
              orderKey: baseline.orderKey,
              createdBy: input.ownerId,
              createdAt: now
            })
            .onConflictDoNothing()
        }

        let orderKey: string | null =
          BASELINE_STATUS_SEED.at(-1)?.orderKey ?? null
        for (const status of input.plan.createdStatuses) {
          orderKey = generateKeyBetween(orderKey, null)
          yield* tx
            .insert(projectStatus)
            .values({
              projectId: id,
              slug: status.slug,
              label: status.label,
              icon: status.icon,
              color: status.color,
              orderKey,
              createdBy: input.ownerId,
              createdAt: now
            })
            .onConflictDoNothing()
        }

        for (const member of input.members) {
          yield* tx
            .insert(projectMember)
            .values({
              projectSlug: input.plan.project.slug,
              projectId: id,
              userId: member.userId,
              role: member.role
            })
            .onConflictDoNothing()
        }

        const usedTagColors: Array<string> = []
        for (const tag of input.plan.tags) {
          const tagColor = pickStatusColor(usedTagColors)
          usedTagColors.push(tagColor)
          yield* tx
            .insert(projectTag)
            .values({
              projectId: id,
              name: tag.name,
              color: tagColor,
              createdBy: input.ownerId,
              createdAt: now
            })
            .onConflictDoNothing()
        }

        yield* deps.ticketIndex.rebuildProject({
          orgSlug: input.orgSlug,
          organizationId: input.organizationId,
          projectId: id,
          projectSlug: input.plan.project.slug
        })

        const published = yield* tx
          .update(jiraMigration)
          .set({
            status: "succeeded",
            phase: "succeeded",
            destinationProjectId: id,
            destinationProjectSlug: input.plan.project.slug,
            reportPath: input.reportPath,
            failureReason: null,
            failureRetryable: null,
            finishedAt: now,
            leaseId: null,
            leaseExpiresAt: null,
            revision: drizzleSql`${jiraMigration.revision} + 1`,
            updatedAt: now
          })
          .where(
            and(
              eq(jiraMigration.id, input.migrationId),
              eq(jiraMigration.leaseId, input.leaseId),
              eq(jiraMigration.status, "migrating")
            )
          )
          .returning({ id: jiraMigration.id })
        if (!published[0]) return yield* Effect.interrupt

        return id
      })
    )
    .pipe(Effect.catchTag("SqlError", Effect.die))

  if (publication === "slug-taken") {
    return yield* new JiraMigrationBlocked({
      blockers: [
        {
          code: "project-slug-collision",
          subjectId: input.plan.project.slug
        }
      ]
    })
  }

  return {
    kind: "published" as const,
    projectSlug: input.plan.project.slug,
    ticketCount: input.plan.tickets.length,
    commentCount: input.plan.comments.length,
    groupCount: input.plan.groups.length
  }
})

export function nextTicketNumberFor(plan: JiraPublicationPlan): number {
  const numbers = plan.tickets.flatMap((ticket) => {
    const parsed = Number.parseInt(ticket.id.split("-").at(-1) ?? "", 10)
    return Number.isFinite(parsed) ? [parsed] : []
  })
  return numbers.length === 0 ? 1 : Math.max(...numbers) + 1
}

export interface JiraImportMember {
  readonly userId: string
  readonly username: string
  readonly role: "owner" | "member"
}

export const resolveJiraImportMembers = Effect.fn("JiraImport.members")(
  function* (
    deps: JiraImportDependencies,
    ownerId: string,
    plan: JiraPublicationPlan
  ) {
    const referenced = new Set<string>([ownerId])
    for (const ticket of plan.tickets) {
      for (const assignee of ticket.assignees) referenced.add(assignee)
    }
    for (const comment of plan.comments) {
      if (comment.author.kind === "user") referenced.add(comment.author.userId)
    }
    const rows = yield* deps.db
      .select({
        id: userTable.id,
        username: userTable.username,
        email: userTable.email
      })
      .from(userTable)
      .where(inArray(userTable.id, [...referenced]))
      .pipe(Effect.orDie)
    return rows.map((row): JiraImportMember => ({
      userId: row.id,
      username: row.username ?? row.email,
      role: row.id === ownerId ? "owner" : "member"
    }))
  }
)

export const jiraImportEnvironment = Effect.fn("JiraImport.environment")(
  function* (
    deps: JiraImportDependencies,
    organizationId: string,
    ownedProjectSlug: string | null = null
  ) {
    const projects = yield* deps.db
      .select({ slug: projectIndex.slug, key: projectIndex.key })
      .from(projectIndex)
      .where(eq(projectIndex.organizationId, organizationId))
      .pipe(Effect.orDie)
    const tickets = yield* deps.db
      .select({
        ticketId: ticketIndex.ticketId,
        projectSlug: ticketIndex.projectSlug
      })
      .from(ticketIndex)
      .where(eq(ticketIndex.organizationId, organizationId))
      .pipe(Effect.orDie)
    const users = yield* deps.db
      .select({ id: userTable.id })
      .from(userTable)
      .pipe(Effect.orDie)
    const reservedSlugs = yield* deps.db
      .select({ slug: projectIndex.slug })
      .from(projectIndex)
      .pipe(Effect.orDie)
    const owned = projects.filter(({ slug }) => slug === ownedProjectSlug)
    const others = projects.filter(({ slug }) => slug !== ownedProjectSlug)
    const ownedTicketIds = new Set(
      owned.length === 0
        ? []
        : tickets
            .filter(({ projectSlug }) => projectSlug === ownedProjectSlug)
            .map(({ ticketId }) => ticketId)
    )
    return {
      existingProjectSlugs: reservedSlugs
        .map(({ slug }) => slug)
        .filter((slug) => slug !== ownedProjectSlug),
      existingProjectKeys: others.map(({ key }) => key),
      existingTicketIds: tickets
        .filter(({ ticketId }) => !ownedTicketIds.has(ticketId))
        .map(({ ticketId }) => ticketId),
      existingUserIds: users.map(({ id }) => id),
      existingStatusSlugs: ["todo", "in_progress", "done"]
    } satisfies JiraPreflightEnvironment
  }
)

export interface JiraAttachmentCopyInput {
  readonly organizationId: string
  readonly orgSlug: string
  readonly projectSlug: string
  readonly userId: string
  readonly cloudId: string
  readonly connection: S3Connection
  readonly ticketIdBySourceIssueId: ReadonlyMap<string, string>
  readonly attachments: ReadonlyArray<JiraManifestAttachment>
}

export const copyJiraAttachments = Effect.fn("JiraImport.copyAttachments")(
  function* (
    deps: JiraImportDependencies,
    jira: Pick<JiraClientShape, "attachmentContent">,
    s3: S3StorageShape,
    input: JiraAttachmentCopyInput
  ) {
    const urls: Record<string, string> = {}
    const alreadyCopied = yield* deps.db
      .select({
        id: attachmentIndex.id,
        ticketId: attachmentIndex.ticketId,
        filename: attachmentIndex.filename,
        byteSize: attachmentIndex.byteSize
      })
      .from(attachmentIndex)
      .where(
        and(
          eq(attachmentIndex.organizationId, input.organizationId),
          eq(attachmentIndex.projectSlug, input.projectSlug)
        )
      )
      .pipe(Effect.orDie)
    const existingByKey = new Map(
      alreadyCopied.map((row) => [
        `${row.ticketId}|${row.filename}|${row.byteSize}`,
        row.id
      ])
    )

    yield* Effect.forEach(
      input.attachments,
      (attachment) =>
        Effect.gen(function* () {
          const ticketId = input.ticketIdBySourceIssueId.get(attachment.issueId)
          if (!ticketId) return
          const existingId = existingByKey.get(
            `${ticketId}|${attachment.filename}|${attachment.byteSize}`
          )
          if (existingId) {
            urls[attachment.id] = attachmentUrl(input.orgSlug, existingId)
            return
          }
          const id = ulid()
          const objectKey = attachmentObjectKey({
            keyPrefix: input.connection.keyPrefix,
            orgSlug: input.orgSlug,
            projectSlug: input.projectSlug,
            ticketId,
            attachmentId: id,
            filename: attachment.filename
          })
          const chunks = yield* Stream.runCollect(
            jira.attachmentContent(input.userId, input.cloudId, attachment.id)
          )
          const parts = [...chunks]
          const total = parts.reduce((sum, part) => sum + part.length, 0)
          const bytes = new Uint8Array(total)
          let offset = 0
          for (const part of parts) {
            bytes.set(part, offset)
            offset += part.length
          }
          yield* s3.putObject(
            input.connection,
            objectKey,
            attachment.mimeType,
            bytes
          )
          yield* deps.db
            .insert(attachmentIndex)
            .values({
              id,
              organizationId: input.organizationId,
              orgSlug: input.orgSlug,
              projectSlug: input.projectSlug,
              ticketId,
              objectKey,
              filename: attachment.filename,
              contentType: attachment.mimeType,
              byteSize: bytes.length,
              status: "pending",
              uploadedBy: input.userId
            })
            .pipe(Effect.orDie)
          urls[attachment.id] = attachmentUrl(input.orgSlug, id)
        }),
      { concurrency: 4, discard: true }
    )
    return urls
  }
)

export const markJiraAttachmentsLive = Effect.fn("JiraImport.attachmentsLive")(
  function* (
    deps: JiraImportDependencies,
    organizationId: string,
    projectSlug: string
  ) {
    yield* deps.db
      .update(attachmentIndex)
      .set({ status: "live" })
      .where(
        and(
          eq(attachmentIndex.organizationId, organizationId),
          eq(attachmentIndex.projectSlug, projectSlug),
          eq(attachmentIndex.status, "pending")
        )
      )
      .pipe(Effect.orDie)
  }
)

export function aliasJiraMediaReferences(
  manifest: JiraMigrationManifest,
  urlsByAttachmentId: Readonly<Record<string, string>>
): Readonly<Record<string, string>> {
  const attachmentsByIssue = new Map<string, Array<JiraManifestAttachment>>()
  for (const attachment of manifest.attachments) {
    const existing = attachmentsByIssue.get(attachment.issueId)
    if (existing) existing.push(attachment)
    else attachmentsByIssue.set(attachment.issueId, [attachment])
  }

  const aliased: Record<string, string> = { ...urlsByAttachmentId }
  const resolve = (issueId: string, filename: string) => {
    const onIssue = (attachmentsByIssue.get(issueId) ?? [])
      .filter((attachment) => attachment.filename === filename)
      .toSorted((left, right) => (left.id < right.id ? -1 : 1))
    if (onIssue[0]) return onIssue[0].id
    const anywhere = manifest.attachments
      .filter((attachment) => attachment.filename === filename)
      .toSorted((left, right) => (left.id < right.id ? -1 : 1))
    return anywhere.length === 1 ? anywhere[0]!.id : null
  }

  const apply = (
    issueId: string,
    references: JiraMigrationManifest["comments"][number]["body"]["references"]
  ) => {
    for (const reference of references) {
      if (reference.kind !== "jira-attachment") continue
      if (aliased[reference.sourceId] !== undefined) continue
      const attachmentId = resolve(issueId, reference.fallbackText)
      if (attachmentId === null) continue
      const url = urlsByAttachmentId[attachmentId]
      if (url !== undefined) aliased[reference.sourceId] = url
    }
  }

  for (const issue of manifest.issues) {
    if (issue.description !== null)
      apply(issue.id, issue.description.references)
  }
  for (const comment of manifest.comments) {
    apply(comment.issueId, comment.body.references)
  }
  return aliased
}

export const reconcileJiraAttachmentReferences = Effect.fn(
  "JiraImport.reconcileAttachments"
)(function* (
  attachments: Pick<AttachmentsShape, "reconcileTicket">,
  orgSlug: string,
  plan: JiraPublicationPlan
) {
  const commentsByTicket = new Map<string, Array<string>>()
  for (const comment of plan.comments) {
    const existing = commentsByTicket.get(comment.ticketId)
    if (existing) existing.push(comment.body)
    else commentsByTicket.set(comment.ticketId, [comment.body])
  }

  yield* Effect.forEach(
    plan.tickets,
    (ticket) =>
      attachments.reconcileTicket(
        orgSlug,
        plan.project.slug,
        ticket.id,
        [ticket.body, ...(commentsByTicket.get(ticket.id) ?? [])].join("\n\n")
      ),
    { concurrency: 8, discard: true }
  )
})
