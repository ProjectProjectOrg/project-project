import { ProjectPolicy } from "@pp/access/policies"
import { Db } from "@pp/db"
import { publishedProject } from "@pp/db/projectVisibility"
import {
  invitation,
  projectGitAutomation,
  projectIndex,
  projectInviteGrant,
  projectMember,
  projectStatus
} from "@pp/db/schema"
import {
  BASELINE_STATUS_SEED,
  Conflict,
  GIT_AUTOMATION_SEED,
  deriveProjectIdentity,
  Forbidden,
  paginateSorted,
  ProjectColor,
  ProjectIcon,
  ProjectKey,
  OrgScope,
  ProjectScope
} from "@pp/shared"
import type {
  CreateProjectInput,
  CursorPayload,
  NotFound,
  Project,
  ProjectDetail,
  ProjectSetup,
  UpdateProjectInput,
  UpdateProjectSetupInput
} from "@pp/shared"
import { and, asc, eq } from "drizzle-orm"
import * as Context from "effect/Context"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"

import { projectMemberOf, projectScopeOf } from "../access/projectScope"
import type * as Markdown from "../markdown/Markdown"
import { bannerNeedsPlaceholder } from "./bannerPlaceholder"
import * as BannerPlaceholders from "./BannerPlaceholders"
import * as ProjectDetails from "./ProjectDetails"
import * as ProjectDocs from "./ProjectDocs"
import {
  iconImageSlots,
  replaceProjectImageReference
} from "./projectImageReferences"
import { annotateProjectTelemetry } from "./projectTelemetry"
import { readProjectDocument } from "./readProjectDocument"
import { syncProjectInvite } from "./syncProjectInvite"
import { uniqueConstraint } from "./uniqueConstraint"

const MAX_SLUG_ATTEMPTS = 100
const makeProjectKey = Schema.decodeUnknownSync(ProjectKey)
const makeProjectIcon = Schema.decodeUnknownSync(ProjectIcon)
const makeProjectColor = Schema.decodeUnknownSync(ProjectColor)
const defaultSetup = (): ProjectSetup => ({
  workflowReviewedAt: null,
  invitePeopleDismissedAt: null,
  connectGithubDismissedAt: null
})

function slugify(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

export class Projects extends Context.Service<
  Projects,
  Readonly<{
    list: () => Effect.Effect<ReadonlyArray<Project>, never, OrgScope>
    listPaged: (
      cursor: CursorPayload | undefined,
      limit: number
    ) => Effect.Effect<
      Readonly<{ items: ReadonlyArray<Project>; nextCursor: string | null }>,
      never,
      OrgScope
    >
    create: (
      input: CreateProjectInput
    ) => Effect.Effect<Project, Conflict, OrgScope>
    get: () => Effect.Effect<
      ProjectDetail,
      NotFound | Markdown.MarkdownError,
      ProjectScope
    >
    key: () => Effect.Effect<ProjectKey, NotFound, ProjectScope>

    update: (
      input: UpdateProjectInput
    ) => Effect.Effect<
      ProjectDetail,
      Forbidden | NotFound | Markdown.MarkdownError,
      ProjectScope
    >
    updateSetup: (
      input: UpdateProjectSetupInput
    ) => Effect.Effect<
      ProjectDetail,
      NotFound | Markdown.MarkdownError,
      ProjectScope
    >
    remove: () => Effect.Effect<void, Markdown.MarkdownError, ProjectScope>
  }>
>()("@pp/server-core/projects/Projects") {}

const make = Effect.gen(function* () {
  const db = yield* Db

  const bannerPlaceholders = yield* BannerPlaceholders.BannerPlaceholders

  const projectDocs = yield* ProjectDocs.ProjectDocs
  const {
    withWriteLock: withProjectWriteLock,
    current: inScope,
    members: loadMembers,
    pendingMembers: loadPendingMembers,
    githubConnection: loadGithubConnection,
    writeFrontmatter: syncFrontmatter
  } = yield* ProjectDetails.ProjectDetails

  const findFreeSlug = (
    organizationId: string,
    base: string
  ): Effect.Effect<string> =>
    Effect.gen(function* () {
      const safeBase = base.length > 0 ? base : "project"
      for (let i = 0; i < MAX_SLUG_ATTEMPTS; i++) {
        const candidate = i === 0 ? safeBase : `${safeBase}-${i + 1}`
        const existing = yield* db.query.projectIndex
          .findFirst({
            columns: { slug: true },
            where: {
              RAW: (table, _operators) =>
                _operators.and(
                  _operators.eq(table.organizationId, organizationId),
                  _operators.eq(table.slug, candidate)
                )!
            }
          })
          .pipe(Effect.orDie)
        if (!existing) return candidate
      }
      return yield* Effect.die(
        new Error(`could not allocate unique slug for "${base}"`)
      )
    })

  const list = Effect.fn("Projects.list")(function* () {
    const orgScope = yield* OrgScope
    const { orgSlug, userId } = orgScope
    return yield* annotateProjectTelemetry(
      "list",
      orgSlug,
      { userId },
      Effect.gen(function* () {
        const baseSelect = {
          banner: projectIndex.banner,
          iconImage: projectIndex.iconImage,
          slug: projectIndex.slug,
          key: projectIndex.key,
          name: projectIndex.name,
          icon: projectIndex.icon,
          color: projectIndex.color,
          createdBy: projectIndex.createdBy,
          createdAt: projectIndex.createdAt
        }
        const candidates = yield* db
          .select({
            ...baseSelect,
            projectId: projectIndex.id,
            role: projectMember.roleId
          })
          .from(projectIndex)
          .leftJoin(projectMember, projectMemberOf(orgScope))
          .where(
            and(
              eq(projectIndex.organizationId, orgScope.organizationId),
              publishedProject()
            )
          )
          .orderBy(asc(projectIndex.createdAt))
          .pipe(Effect.orDie)
        const visible = yield* Effect.forEach(candidates, (row) =>
          projectScopeOf(orgScope, row)
        )
        const rows = candidates.filter((_, index) =>
          Option.isSome(visible[index])
        )
        const healable = rows.filter((r) => bannerNeedsPlaceholder(r.banner))
        if (healable.length > 0)
          yield* Effect.forkDetach(
            Effect.forEach(
              healable,
              (r) => bannerPlaceholders.ensure(orgSlug, r.slug, r.banner),
              { concurrency: 2, discard: true }
            )
          )
        return rows.map((r) => ({
          banner: r.banner ?? null,
          iconImage: r.iconImage ?? null,
          org: orgSlug,
          slug: r.slug,
          key: makeProjectKey(r.key),
          name: r.name,
          icon: makeProjectIcon(r.icon),
          color: makeProjectColor(r.color),
          createdBy: r.createdBy,
          createdAt: r.createdAt
        }))
      })
    )
  })

  const projectSortKey = (p: { createdAt: Date; slug: string }) =>
    `${(Number.MAX_SAFE_INTEGER - p.createdAt.getTime())
      .toString()
      .padStart(20, "0")}|${p.slug}`

  const listPaged = Effect.fn("Projects.listPaged")(function* (
    cursor: CursorPayload | undefined,
    limit: number
  ) {
    const all = yield* list()
    const sorted = [...all].toSorted((a, b) => {
      const dt = b.createdAt.getTime() - a.createdAt.getTime()
      if (dt !== 0) return dt
      return a.slug.localeCompare(b.slug)
    })
    return paginateSorted(sorted, {
      cursor,
      limit,
      sortKey: projectSortKey,
      id: (p) => p.slug
    })
  })

  const key = Effect.fn("Projects.key")(function* () {
    const { indexRow } = yield* inScope
    return makeProjectKey(indexRow.key)
  })

  const create = Effect.fn("Projects.create")(function* (
    input: CreateProjectInput
  ) {
    const { organizationId, orgSlug, userId: createdBy } = yield* OrgScope
    return yield* annotateProjectTelemetry(
      "create",
      orgSlug,
      { createdBy, projectName: input.name, projectKey: input.key },
      Effect.gen(function* () {
        const slug = yield* findFreeSlug(organizationId, slugify(input.name))
        const createdAt = yield* DateTime.nowAsDate
        const key = makeProjectKey(input.key)
        const identityRaw = deriveProjectIdentity(slug)
        const identity = {
          icon: makeProjectIcon(identityRaw.icon),
          color: makeProjectColor(identityRaw.color)
        }
        const existingKey = yield* db.query.projectIndex
          .findFirst({
            columns: { slug: true },
            where: {
              RAW: (table, _operators) =>
                _operators.and(
                  _operators.eq(table.organizationId, organizationId),
                  _operators.eq(table.key, input.key)
                )!
            }
          })
          .pipe(Effect.orDie)
        if (existingKey) {
          return yield* new Conflict({ reason: "project_key_taken" })
        }

        const row = yield* db
          .transaction(() =>
            Effect.gen(function* () {
              const [inserted] = yield* db
                .insert(projectIndex)
                .values({
                  slug,
                  key,
                  name: input.name,
                  icon: identity.icon,
                  color: identity.color,
                  createdBy,
                  createdAt,
                  publishedAt: createdAt,
                  organizationId
                })
                .returning()
                .pipe(
                  Effect.catch((cause) =>
                    uniqueConstraint(
                      cause,
                      "project_index_organization_key_uidx"
                    )
                      ? Effect.fail(
                          new Conflict({ reason: "project_key_taken" })
                        )
                      : Effect.die(cause)
                  )
                )

              yield* db
                .insert(projectMember)
                .values({
                  projectId: inserted.id,
                  organizationId,
                  userId: createdBy,
                  roleId: "pm"
                })
                .pipe(Effect.orDie)

              yield* db
                .insert(projectStatus)
                .values(
                  BASELINE_STATUS_SEED.map((baseline) => ({
                    projectId: inserted.id,
                    slug: baseline.slug,
                    label: baseline.label,
                    icon: baseline.icon,
                    color: baseline.color,
                    orderKey: baseline.orderKey,
                    description: baseline.description,
                    createdBy
                  }))
                )
                .pipe(Effect.orDie)

              yield* db
                .insert(projectGitAutomation)
                .values(
                  GIT_AUTOMATION_SEED.map((rule) => ({
                    projectId: inserted.id,
                    event: rule.event,
                    statusSlug: rule.statusSlug
                  }))
                )
                .pipe(Effect.orDie)
              return inserted
            })
          )
          .pipe(Effect.catchTag("SqlError", Effect.die))

        const rollback = db
          .delete(projectIndex)
          .where(eq(projectIndex.id, row.id))
          .pipe(Effect.orDie)

        yield* syncFrontmatter(
          orgSlug,
          slug,
          input.name,
          identity.icon,
          identity.color,
          createdBy,
          createdAt,
          key,
          `# ${input.name}\n`,
          null,
          defaultSetup(),
          "off"
        ).pipe(
          Effect.catch((cause) =>
            rollback.pipe(Effect.andThen(Effect.die(cause)))
          )
        )

        return {
          org: orgSlug,
          slug: row.slug,
          key: makeProjectKey(row.key),
          name: row.name,
          icon: makeProjectIcon(row.icon),
          color: makeProjectColor(row.color),
          createdBy: row.createdBy,
          createdAt: row.createdAt,
          banner: null,
          iconImage: null
        }
      })
    )
  })

  const get = Effect.fn("Projects.get")(function* () {
    const { scope, indexRow } = yield* inScope
    const { orgSlug, slug, userId } = scope
    return yield* annotateProjectTelemetry(
      "get",
      orgSlug,
      { slug, userId },
      Effect.gen(function* () {
        const [file, members, pendingMembers, connection, banner] =
          yield* Effect.all(
            [
              readProjectDocument({
                db,
                docs: projectDocs,
                project: scope,
                indexed: indexRow
              }),
              loadMembers(indexRow.id),
              loadPendingMembers(indexRow.id),
              loadGithubConnection(indexRow),
              bannerPlaceholders.ensure(orgSlug, slug, indexRow.banner)
            ],
            { concurrency: "unbounded" }
          )
        const key = makeProjectKey(indexRow.key)
        return ProjectDetails.presentDetail(scope, {
          org: orgSlug,
          slug: indexRow.slug,
          key,
          name: indexRow.name,
          icon: makeProjectIcon(indexRow.icon),
          color: makeProjectColor(indexRow.color),
          createdBy: indexRow.createdBy,
          createdAt: indexRow.createdAt,
          github: connection,
          banner,
          iconImage: indexRow.iconImage ?? null,
          setup: file.setup,
          estimation: file.estimation,
          body: file.body,
          nextTicketNumber: indexRow.nextTicketNumber,
          members,
          pendingMembers
        })
      })
    )
  })

  const update = Effect.fn("Projects.update")(function* (
    input: UpdateProjectInput
  ) {
    const scope = yield* ProjectScope
    const { body, ...settings } = input
    const allowed = ProjectPolicy.canUpdate(scope, {
      body: body !== undefined,
      settings:
        body === undefined ||
        Object.values(settings).some((value) => value !== undefined)
    })
    if (!allowed) return yield* new Forbidden()
    const { orgSlug, slug, userId, projectId } = scope
    return yield* annotateProjectTelemetry(
      "update",
      orgSlug,
      { slug, userId },
      Effect.gen(function* () {
        const { indexRow } = yield* inScope
        const file = yield* readProjectDocument({
          db,
          docs: projectDocs,
          project: scope,
          indexed: indexRow
        })
        const connection = yield* loadGithubConnection(indexRow)

        const nextBanner =
          input.banner === undefined
            ? (indexRow.banner ?? null)
            : (input.banner ?? null)
        if (input.banner !== undefined) {
          yield* replaceProjectImageReference(db, {
            projectId: indexRow.id,
            slot: "banner",
            attachmentId:
              nextBanner?.type === "attachment" ? nextBanner.attachmentId : null
          })
        }

        const nextIconImage =
          input.iconImage === undefined
            ? (indexRow.iconImage ?? null)
            : input.iconImage
        if (input.iconImage !== undefined) {
          const slots = iconImageSlots(nextIconImage)
          yield* db.transaction(() =>
            Effect.gen(function* () {
              yield* replaceProjectImageReference(db, {
                projectId: indexRow.id,
                slot: "icon",
                attachmentId: slots.icon
              })
              yield* replaceProjectImageReference(db, {
                projectId: indexRow.id,
                slot: "icon_source",
                attachmentId: slots.iconSource
              })
            })
          )
        }

        const nextName = input.name ?? indexRow.name
        const nextBody = input.body ?? file.body
        const nextIcon = input.icon ?? makeProjectIcon(indexRow.icon)
        const nextColor = input.color ?? makeProjectColor(indexRow.color)
        const nextEstimation = input.estimation ?? file.estimation

        const dbPatch: Partial<typeof projectIndex.$inferInsert> = {}
        if (input.banner !== undefined) dbPatch.banner = nextBanner
        if (input.iconImage !== undefined) dbPatch.iconImage = nextIconImage
        if (input.name !== undefined && input.name !== indexRow.name) {
          dbPatch.name = nextName
        }
        if (input.icon !== undefined && input.icon !== indexRow.icon) {
          dbPatch.icon = nextIcon
        }
        if (input.color !== undefined && input.color !== indexRow.color) {
          dbPatch.color = nextColor
        }
        if (nextEstimation !== file.estimation) {
          dbPatch.estimation = nextEstimation
        }
        if (Object.keys(dbPatch).length > 0) {
          yield* db
            .update(projectIndex)
            .set(dbPatch)
            .where(eq(projectIndex.id, indexRow.id))
            .pipe(Effect.orDie)
        }

        const members = yield* loadMembers(indexRow.id)
        const pendingMembers = yield* loadPendingMembers(indexRow.id)
        yield* syncFrontmatter(
          orgSlug,
          slug,
          nextName,
          nextIcon,
          nextColor,
          indexRow.createdBy,
          indexRow.createdAt,
          makeProjectKey(indexRow.key),
          nextBody,
          connection,
          file.setup,
          nextEstimation
        )

        return ProjectDetails.presentDetail(scope, {
          org: orgSlug,
          slug,
          key: makeProjectKey(indexRow.key),
          name: nextName,
          icon: nextIcon,
          color: nextColor,
          createdBy: indexRow.createdBy,
          createdAt: indexRow.createdAt,
          github: connection,
          banner: nextBanner,
          iconImage: nextIconImage,
          setup: file.setup,
          estimation: nextEstimation,
          body: nextBody,
          nextTicketNumber: indexRow.nextTicketNumber,
          members,
          pendingMembers
        })
      }).pipe((effect) => withProjectWriteLock(projectId, effect))
    )
  })

  const updateSetup = Effect.fn("Projects.updateSetup")(function* (
    input: UpdateProjectSetupInput
  ) {
    const scope = yield* ProjectScope
    const { orgSlug, slug, userId, projectId } = scope
    return yield* annotateProjectTelemetry(
      "updateSetup",
      orgSlug,
      { slug, userId },
      Effect.gen(function* () {
        const { indexRow } = yield* inScope
        const file = yield* readProjectDocument({
          db,
          docs: projectDocs,
          project: scope,
          indexed: indexRow
        })
        const connection = yield* loadGithubConnection(indexRow)
        const members = yield* loadMembers(indexRow.id)
        const pendingMembers = yield* loadPendingMembers(indexRow.id)
        const setup = { ...file.setup, ...input }
        yield* syncFrontmatter(
          orgSlug,
          slug,
          indexRow.name,
          indexRow.icon,
          indexRow.color,
          indexRow.createdBy,
          indexRow.createdAt,
          makeProjectKey(indexRow.key),
          file.body,
          connection,
          setup,
          file.estimation
        )
        return ProjectDetails.presentDetail(scope, {
          org: orgSlug,
          slug,
          key: makeProjectKey(indexRow.key),
          name: indexRow.name,
          icon: makeProjectIcon(indexRow.icon),
          color: makeProjectColor(indexRow.color),
          createdBy: indexRow.createdBy,
          createdAt: indexRow.createdAt,
          github: connection,
          setup,
          estimation: file.estimation,
          banner: indexRow.banner ?? null,
          iconImage: indexRow.iconImage ?? null,
          body: file.body,
          nextTicketNumber: indexRow.nextTicketNumber,
          members,
          pendingMembers
        })
      }).pipe((effect) => withProjectWriteLock(projectId, effect))
    )
  })

  const remove = Effect.fn("Projects.remove")(function* () {
    const { orgSlug, slug, userId, projectId } = yield* ProjectScope
    yield* annotateProjectTelemetry(
      "remove",
      orgSlug,
      { slug, userId },
      Effect.gen(function* () {
        yield* projectDocs.removeDir(orgSlug, slug)
        yield* withProjectWriteLock(
          projectId,
          Effect.gen(function* () {
            const affected = yield* db
              .select({ id: invitation.id })
              .from(invitation)
              .innerJoin(
                projectInviteGrant,
                and(
                  eq(projectInviteGrant.invitationId, invitation.id),
                  eq(projectInviteGrant.projectId, projectId)
                )
              )
              .where(
                and(
                  eq(invitation.fromProject, true),
                  eq(invitation.status, "pending")
                )
              )
              .orderBy(asc(invitation.id))
              .for("update", { of: invitation })
              .pipe(Effect.orDie)
            yield* db
              .delete(projectIndex)
              .where(eq(projectIndex.id, projectId))
              .pipe(Effect.orDie)
            yield* Effect.forEach(
              affected,
              ({ id }) => syncProjectInvite(db, id),
              { discard: true }
            )
          })
        )
      })
    )
  })

  return Projects.of({
    list,
    listPaged,
    create,
    get,
    key,
    update,
    updateSetup,
    remove
  })
})

export const layer = Layer.effect(Projects, make)
