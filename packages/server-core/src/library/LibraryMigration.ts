import { Db } from "@pp/db"
import { publishedProject } from "@pp/db/projectVisibility"
import { organization, projectIndex, ticketIndex } from "@pp/db/schema"
import { LEGACY_NO_TYPE } from "@pp/shared"
import { and, asc, eq, sql } from "drizzle-orm"
import * as Cause from "effect/Cause"
import * as Context from "effect/Context"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Match from "effect/Match"

import { markdownFileContent, parseMarkdownFile } from "../markdown/fileContent"
import * as Markdown from "../markdown/Markdown"
import * as TicketDocumentLock from "../tickets/ticketDocumentLock"
import * as LibraryDocs from "./LibraryDocs"
import {
  isEmptyLegacyLayer,
  LEGACY_DEFAULTS_KEY,
  legacyDefaultsFrom,
  legacyLayerFrom,
  type LayerPlan,
  type LegacyLayer,
  type MigrationStep,
  planOrgLayer,
  planProjectLayer,
  stepKey,
  withoutLegacyDefaults,
  withoutLegacyTicketType
} from "./typeMigration"

export type LayerMigration = Readonly<{
  orgSlug: string
  projectSlug: string | null
  written: ReadonlyArray<string>
  skipped: ReadonlyArray<string>
}>

export type MigrationSummary = Readonly<{
  migrated: ReadonlyArray<LayerMigration>
  failed: ReadonlyArray<
    Readonly<{ orgSlug: string; projectSlug: string | null }>
  >
}>

type ProjectRef = Readonly<{ orgSlug: string; projectSlug: string }>

type PendingProject = ProjectRef & Readonly<{ projectId: string }>

export type TicketTypeMigration = ProjectRef & Readonly<{ rewritten: number }>

export type TicketTypeSummary = Readonly<{
  migrated: ReadonlyArray<TicketTypeMigration>
  failed: ReadonlyArray<ProjectRef>
}>

export class LibraryMigration extends Context.Service<
  LibraryMigration,
  Readonly<{
    migrateTemplates: () => Effect.Effect<
      MigrationSummary,
      Markdown.MarkdownError
    >
    migrateTicketTypes: () => Effect.Effect<TicketTypeSummary, never, Db>
  }>
>()("@pp/server-core/library/LibraryMigration") {}

class OrgLibraryUnreadable extends Data.TaggedError("OrgLibraryUnreadable")<
  Readonly<{ cause: unknown }>
> {}

type LegacyFrontmatter = Readonly<{
  data: Record<string, unknown>
  body: string
}>

type LegacyState = Readonly<{
  layer: LegacyLayer
  frontmatter: LegacyFrontmatter | null
}>

type ProjectOutcome = Readonly<{
  failed: boolean
  migration: LayerMigration | null
}>

const hasLegacyDefaults = (frontmatter: LegacyFrontmatter | null) =>
  frontmatter !== null && LEGACY_DEFAULTS_KEY in frontmatter.data

const stepOutcome = (step: MigrationStep) =>
  Match.value(step).pipe(
    Match.tagsExhaustive({
      type: () => "type",
      raw: () => "unreadable type file",
      tombstone: () => "hidden type",
      unhidden: () => "built-in type, no longer hidden"
    })
  )

const logLayer = (migration: LayerMigration) =>
  Effect.logInfo("library migration: layer migrated").pipe(
    Effect.annotateLogs({
      orgSlug: migration.orgSlug,
      projectSlug: migration.projectSlug,
      written: migration.written.length,
      skipped: migration.skipped.length
    })
  )

const make = Effect.gen(function* () {
  const markdown = yield* Markdown.Markdown
  const docs = yield* LibraryDocs.LibraryDocs
  const { withTicketDocumentLock, withTicketWriteLocks } =
    yield* TicketDocumentLock.TicketDocumentLock

  const orgFrontmatter = (orgSlug: string) =>
    Effect.gen(function* () {
      const content = yield* markdown.readOrgLibraryFile(orgSlug)
      if (content === null) return null
      return yield* Effect.try({
        try: () => {
          const parsed = parseMarkdownFile(content)
          return { data: parsed.data, body: parsed.content }
        },
        catch: (cause) => new OrgLibraryUnreadable({ cause })
      }).pipe(
        Effect.catchTag("OrgLibraryUnreadable", (error) =>
          Effect.logWarning(
            "library migration: leaving unreadable org library.md untouched"
          ).pipe(
            Effect.annotateLogs({ orgSlug, cause: error.cause }),
            Effect.as(null)
          )
        )
      )
    })

  const projectFrontmatter = (orgSlug: string, projectSlug: string) =>
    markdown.readProjectFile(orgSlug, projectSlug).pipe(
      Effect.map((file) => ({ data: file.data, body: file.body })),
      Effect.catchTag("NotFound", () => Effect.succeed(null))
    )

  const readLegacy = (orgSlug: string, projectSlug: string | null) =>
    Effect.gen(function* () {
      const files = yield* markdown.listLegacyTemplateFiles(
        orgSlug,
        projectSlug
      )
      const frontmatter =
        projectSlug === null
          ? yield* orgFrontmatter(orgSlug)
          : yield* projectFrontmatter(orgSlug, projectSlug)
      return {
        layer: legacyLayerFrom(
          files,
          frontmatter === null ? {} : legacyDefaultsFrom(frontmatter.data)
        ),
        frontmatter
      }
    })

  const writeStep = (
    orgSlug: string,
    projectSlug: string | null,
    step: MigrationStep
  ) =>
    Match.value(step).pipe(
      Match.tagsExhaustive({
        type: (typed) => docs.writeType(orgSlug, projectSlug, typed.draft),
        tombstone: (hidden) =>
          docs.writeTombstone(orgSlug, projectSlug, "types", hidden.key),
        unhidden: () => Effect.void,
        raw: (raw) =>
          markdown.writeLibraryFile(
            orgSlug,
            projectSlug,
            "types",
            raw.key,
            raw.content
          )
      })
    )

  const applyStep = (
    orgSlug: string,
    projectSlug: string | null,
    step: MigrationStep
  ) =>
    Effect.gen(function* () {
      const type = stepKey(step)
      const annotations = {
        orgSlug,
        projectSlug,
        template: step.template,
        type,
        became: stepOutcome(step),
        renamed: type !== step.template
      }
      if (step._tag === "unhidden") {
        yield* Effect.logInfo(
          "library migration: hidden template is a built-in type, hide dropped"
        ).pipe(Effect.annotateLogs(annotations))
        return false
      }
      if (yield* docs.hasFile(orgSlug, projectSlug, "types", type)) {
        yield* Effect.logInfo(
          "library migration: type file already exists, template skipped"
        ).pipe(Effect.annotateLogs(annotations))
        return false
      }
      yield* writeStep(orgSlug, projectSlug, step)
      yield* Effect.logInfo("library migration: template became type").pipe(
        Effect.annotateLogs(annotations)
      )
      return true
    })

  const applyPlan = (
    orgSlug: string,
    projectSlug: string | null,
    plan: LayerPlan
  ) =>
    Effect.gen(function* () {
      const outcomes = yield* Effect.forEach(plan.steps, (step) =>
        Effect.map(applyStep(orgSlug, projectSlug, step), (written) => ({
          key: stepKey(step),
          written
        }))
      )
      return {
        orgSlug,
        projectSlug,
        written: outcomes.flatMap((outcome) =>
          outcome.written ? [outcome.key] : []
        ),
        skipped: outcomes.flatMap((outcome) =>
          outcome.written ? [] : [outcome.key]
        )
      }
    })

  const dropOrgDefaults = (orgSlug: string, frontmatter: LegacyFrontmatter) => {
    const rest = withoutLegacyDefaults(frontmatter.data)
    return Object.keys(rest).length === 0 && frontmatter.body.trim() === ""
      ? markdown.removeOrgLibraryFile(orgSlug)
      : markdown.writeOrgLibraryFile(
          orgSlug,
          markdownFileContent(rest, frontmatter.body)
        )
  }

  const finishLayer = (
    orgSlug: string,
    projectSlug: string | null,
    state: LegacyState
  ) =>
    Effect.gen(function* () {
      const removed = yield* markdown.removeLegacyTemplatesDir(
        orgSlug,
        projectSlug
      )
      if (state.frontmatter === null || !hasLegacyDefaults(state.frontmatter))
        return removed
      yield* projectSlug === null
        ? dropOrgDefaults(orgSlug, state.frontmatter)
        : markdown.writeProjectFile(
            orgSlug,
            projectSlug,
            withoutLegacyDefaults(state.frontmatter.data),
            state.frontmatter.body
          )
      return true
    })

  const migrateProject = (
    orgSlug: string,
    projectSlug: string,
    org: LegacyLayer,
    orgPlan: LayerPlan
  ) =>
    Effect.gen(function* () {
      const state = yield* readLegacy(orgSlug, projectSlug)
      const migration = yield* applyPlan(
        orgSlug,
        projectSlug,
        planProjectLayer(state.layer, org, orgPlan)
      )
      const cleaned = yield* finishLayer(orgSlug, projectSlug, state)
      const touched = cleaned || !isEmptyLegacyLayer(state.layer)
      if (!touched && migration.written.length === 0) return null
      yield* logLayer(migration)
      return migration
    })

  const migrateProjectSafely = (
    orgSlug: string,
    projectSlug: string,
    org: LegacyLayer,
    orgPlan: LayerPlan
  ) =>
    migrateProject(orgSlug, projectSlug, org, orgPlan).pipe(
      Effect.map(
        (migration) => ({ failed: false, migration }) satisfies ProjectOutcome
      ),
      Effect.catchCause((cause) =>
        Cause.hasInterrupts(cause)
          ? Effect.interrupt
          : Effect.logError(
              "library migration: project failed, it is retried on the next start",
              cause
            ).pipe(
              Effect.annotateLogs({ orgSlug, projectSlug }),
              Effect.as({
                failed: true,
                migration: null
              } satisfies ProjectOutcome)
            )
      )
    )

  const migrateOrg = (orgSlug: string) =>
    Effect.gen(function* () {
      const state = yield* readLegacy(orgSlug, null)
      const plan = planOrgLayer(state.layer)
      const migration = yield* applyPlan(orgSlug, null, plan)
      const projectSlugs = yield* markdown.listProjectSlugs(orgSlug)
      const outcomes = yield* Effect.forEach(projectSlugs, (projectSlug) =>
        Effect.map(
          migrateProjectSafely(orgSlug, projectSlug, state.layer, plan),
          (outcome) => ({ projectSlug, ...outcome })
        )
      )
      const projects = outcomes.flatMap((outcome) =>
        outcome.migration === null ? [] : [outcome.migration]
      )
      const failed = outcomes.flatMap((outcome) =>
        outcome.failed ? [{ orgSlug, projectSlug: outcome.projectSlug }] : []
      )
      if (failed.length > 0) {
        yield* Effect.logWarning(
          "library migration: org templates kept until every project migrates"
        ).pipe(Effect.annotateLogs({ orgSlug, failedProjects: failed.length }))
        return { migrated: projects, failed } satisfies MigrationSummary
      }
      const cleaned = yield* finishLayer(orgSlug, null, state)
      const touched = cleaned || !isEmptyLegacyLayer(state.layer)
      if (!touched && migration.written.length === 0)
        return { migrated: projects, failed } satisfies MigrationSummary
      yield* logLayer(migration)
      return {
        migrated: [migration, ...projects],
        failed
      } satisfies MigrationSummary
    })

  const migrateOrgSafely = (orgSlug: string) =>
    migrateOrg(orgSlug).pipe(
      Effect.catchCause((cause) =>
        Cause.hasInterrupts(cause)
          ? Effect.interrupt
          : Effect.logError(
              "library migration: org failed, it is retried on the next start",
              cause
            ).pipe(
              Effect.annotateLogs({ orgSlug }),
              Effect.as<MigrationSummary>({
                migrated: [],
                failed: [{ orgSlug, projectSlug: null }]
              })
            )
      )
    )

  const migrateTemplates = Effect.fn("LibraryMigration.migrateTemplates")(
    function* () {
      const orgSlugs = yield* markdown.listOrgSlugs()
      const summaries = yield* Effect.forEach(orgSlugs, migrateOrgSafely)
      return {
        migrated: summaries.flatMap((summary) => summary.migrated),
        failed: summaries.flatMap((summary) => summary.failed)
      }
    }
  )

  const rewriteTicket = (orgSlug: string, projectSlug: string, id: string) =>
    withTicketDocumentLock(
      orgSlug,
      projectSlug,
      id,
      withTicketWriteLocks(
        orgSlug,
        projectSlug,
        [id],
        Effect.gen(function* () {
          const file = yield* markdown.readTicketFileRaw(
            orgSlug,
            projectSlug,
            id
          )
          const rewritten = withoutLegacyTicketType(file.content)
          if (rewritten === null) return false
          yield* markdown.writeTicketFileRaw(
            orgSlug,
            projectSlug,
            id,
            rewritten
          )
          return true
        })
      )
    ).pipe(Effect.catchTag("NotFound", () => Effect.succeed(false)))

  const migrateProjectTickets = (
    db: Db["Service"],
    { orgSlug, projectSlug, projectId }: PendingProject
  ) =>
    Effect.gen(function* () {
      yield* markdown.readProjectFileRaw(orgSlug, projectSlug)
      const ids = yield* markdown.listTicketIds(orgSlug, projectSlug)
      const outcomes = yield* Effect.forEach(
        ids,
        (id) => rewriteTicket(orgSlug, projectSlug, id),
        { concurrency: 8 }
      )
      yield* db
        .update(ticketIndex)
        .set({ type: null })
        .where(
          and(
            eq(ticketIndex.projectId, projectId),
            eq(ticketIndex.type, sql`${LEGACY_NO_TYPE}`)
          )
        )
      yield* db
        .update(projectIndex)
        .set({ ticketTypesMigrated: true })
        .where(eq(projectIndex.id, projectId))
      const rewritten = outcomes.filter(Boolean).length
      if (rewritten > 0) {
        yield* Effect.logInfo(
          "library migration: tickets of type other now have no type"
        ).pipe(Effect.annotateLogs({ orgSlug, projectSlug, rewritten }))
      }
      return { orgSlug, projectSlug, rewritten }
    }).pipe(
      Effect.catchCause((cause) =>
        Cause.hasInterrupts(cause)
          ? Effect.interrupt
          : Effect.logError(
              "library migration: ticket types failed, the project is retried on the next start",
              cause
            ).pipe(
              Effect.annotateLogs({ orgSlug, projectSlug }),
              Effect.as(null)
            )
      )
    )

  const migrateTicketTypes = Effect.fn("LibraryMigration.migrateTicketTypes")(
    function* () {
      const db = yield* Db
      const projects = yield* db
        .select({
          orgSlug: organization.slug,
          projectSlug: projectIndex.slug,
          projectId: projectIndex.id
        })
        .from(projectIndex)
        .innerJoin(
          organization,
          eq(organization.id, projectIndex.organizationId)
        )
        .where(
          and(eq(projectIndex.ticketTypesMigrated, false), publishedProject())
        )
        .orderBy(asc(organization.slug), asc(projectIndex.slug))
        .pipe(Effect.orDie)
      const outcomes = yield* Effect.forEach(projects, (project) =>
        Effect.map(migrateProjectTickets(db, project), (migration) => ({
          project,
          migration
        }))
      )
      return {
        migrated: outcomes.flatMap(({ migration }) =>
          migration === null || migration.rewritten === 0 ? [] : [migration]
        ),
        failed: outcomes.flatMap(
          ({ project: { orgSlug, projectSlug }, migration }) =>
            migration === null ? [{ orgSlug, projectSlug }] : []
        )
      }
    }
  )

  return LibraryMigration.of({ migrateTemplates, migrateTicketTypes })
})

export const layer = Layer.effect(LibraryMigration, make)
