// @effect-diagnostics-next-line nodeBuiltinImport:off
import { createHash } from "node:crypto"

import { JiraMigrationConfiguration } from "@pp/shared"
import * as Effect from "effect/Effect"
import * as Predicate from "effect/Predicate"
import * as Schema from "effect/Schema"

import { convertAdfToMarkdown } from "./Adf"
import { JiraProject } from "./ClientSchemas"
import {
  canonicalJiraJson,
  JiraMigrationManifestV2,
  type JiraMigrationManifest
} from "./Manifest"
import { jiraConfigurationToMappings } from "./Mappings"
import { jiraDocumentBatches } from "./MigrationActivities"
import type {
  JiraArtifactRef,
  JiraMigrationArtifactsShape
} from "./MigrationArtifacts"
import {
  preflightJiraMigration,
  JiraPublicationInvalid,
  type JiraPreflightEnvironment
} from "./Preflight"
import {
  createJiraPublicationPlan,
  finalizeJiraPublication,
  JiraPreparedPublicationV1,
  JiraPublicationPlanV1,
  JiraResolvedSource,
  type JiraAttachmentOutcome
} from "./PublicationPlan"

const decodeUnknownJson = Schema.decodeUnknownEffect(Schema.Json)

const decodeUnknownJiraPreparedPublicationV1 = Schema.decodeUnknownEffect(
  JiraPreparedPublicationV1
)

const decodeUnknownJiraPublicationPlanV1 = Schema.decodeUnknownEffect(
  JiraPublicationPlanV1
)

const decodeUnknownJiraProject = Schema.decodeUnknownEffect(JiraProject)

const decodeUnknownJiraResolvedSource =
  Schema.decodeUnknownEffect(JiraResolvedSource)

const encodeJiraPreparedPublicationV1 = Schema.encodeEffect(
  JiraPreparedPublicationV1
)

const encodeJiraPublicationPlanV1 = Schema.encodeEffect(JiraPublicationPlanV1)

export const buildJiraImportContext = (
  manifest: JiraMigrationManifest,
  configuration: JiraMigrationConfiguration,
  environment: JiraPreflightEnvironment,
  attachmentUrlsBySourceId: Readonly<Record<string, string>>
) => {
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
  configuration: JiraMigrationConfiguration,
  environment: JiraPreflightEnvironment,
  attachmentUrlsBySourceId: Readonly<Record<string, string>>
) =>
  buildJiraImportContext(
    manifest,
    configuration,
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
      .readJson(orgSlug, ref, decodeUnknownJson)
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
    ? yield* decodeUnknownJiraProject(
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
  return yield* decodeUnknownJiraResolvedSource({
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

export const persistJiraPreparedPublication = Effect.fn(
  "JiraImport.persistPreparedPublication"
)(function* (
  prepared: JiraPreparedPublicationV1,
  artifacts: Pick<JiraMigrationArtifactsShape, "writeJson">
) {
  const encoded = yield* encodeJiraPreparedPublicationV1(prepared)
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
    decodeUnknownJiraPreparedPublicationV1
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
  const plan = yield* artifacts.readJson(
    orgSlug,
    ref,
    decodeUnknownJiraPublicationPlanV1
  )
  const encoded = yield* encodeJiraPublicationPlanV1(plan)
  const publicationRevision = createHash("sha256")
    .update(canonicalJiraJson(encoded))
    .digest("hex")
  return { plan, publicationRevision }
})
