import { GroupPolicy, TicketPolicy } from "@pp/access/policies"
import { Db } from "@pp/db"
import * as schema from "@pp/db/schema"
import {
  type BulkUpdateTicketsInput,
  Conflict,
  DEFAULT_TICKET_SORT,
  isStaleEstimate,
  MentionInvalid,
  NotFound,
  formatMentionHref,
  TicketId,
  normalizeLineEndings,
  Validation,
  type ProjectKey,
  type Estimate,
  type SplitTicketResultInput,
  type TemplateKey,
  TicketStatus,
  TicketType,
  ProjectScope,
  ActivityActor,
  type DeleteTicketQuery,
  type BulkUpdateTicketsResult,
  type ClearStaleEstimatesResult,
  type SprintCompletedImmutable,
  type CreateTicketInput,
  type GroupDetail,
  type QuickCreateTicketInput,
  type SplitTicketInput,
  type SplitTicketResult,
  type TicketDetail,
  type TicketSort,
  type TicketUpdateResult,
  type UpdateTicketInput,
  type UpdateTicketOrderInput,
  Forbidden,
  formatMovedFrom,
  planTicketMove,
  rewriteMentionsInMovedTicket,
  rewriteMentionsOfMovedTickets,
  Slug,
  type CurrentUser,
  type MovedTicket,
  type MoveDestination,
  type MoveMentionContext,
  type MoveTicketInput,
  type MoveTicketResult
} from "@pp/shared"
import { and, asc, eq } from "drizzle-orm"
import * as Context from "effect/Context"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"

import * as Access from "../access/Access"
import { ticketChanges } from "../activity/changes"
import * as TicketActivity from "../activity/TicketActivity"
import * as Attachments from "../attachments/Attachments"
import { validateBodyMentionsWithLookups } from "../comments/BodyMentions"
import type * as Comments from "../comments/Comments"
import * as FigmaLinks from "../figma/FigmaLinks"
import * as Groups from "../groups/Groups"
import * as Library from "../library/Library"
import type * as Markdown from "../markdown/Markdown"
import * as ProjectDocs from "../projects/ProjectDocs"
import * as ProjectMembers from "../projects/ProjectMembers"
import * as Projects from "../projects/Projects"
import { readProjectDocument } from "../projects/readProjectDocument"
import * as TicketDocs from "./TicketDocs"
import * as TicketDocumentLock from "./ticketDocumentLock"
import {
  validateHierarchy,
  type HierarchyLookups,
  type HierarchyNode
} from "./ticketHierarchy"
import * as TicketIndex from "./TicketIndex"
import {
  applyTicketPatch,
  batchChangeOf,
  breaksEpicSprintRule,
  fieldChangesOf,
  hierarchyChangeOf,
  isUnchanged,
  openSprintIdsOf,
  revertTicketPatch,
  ticketChangeOf
} from "./ticketPatch"
import {
  documentToTicket,
  requirePolicy,
  type TicketReadError
} from "./ticketPresentation"
import type { TicketProject } from "./ticketProject"
import * as TicketView from "./TicketView"

const makeTicketId = Schema.decodeUnknownSync(TicketId)
const makeOptionalTicketId = (id: string | undefined) =>
  id === undefined ? undefined : makeTicketId(id)
const makeTicketStatus = Schema.decodeSync(TicketStatus)
const makeSlug = Schema.decodeSync(Slug)
const DEFAULT_STATUS = Schema.decodeSync(TicketStatus)("todo")

const requireTicketChange = (change: TicketPolicy.Change) =>
  requirePolicy((scope) => TicketPolicy.canChange(scope, change))

const requireSplit = (
  source: TicketDocs.TicketDocument,
  retained: SplitTicketResultInput,
  created: ReadonlyArray<SplitTicketResultInput>
) =>
  requirePolicy((scope) =>
    TicketPolicy.canSplit(scope, {
      source,
      retained,
      created,
      defaultStatus: DEFAULT_STATUS
    })
  )

export type TicketUpdateExpectation = Readonly<{
  body?: string
  updatedAt?: Date
}>

export class TicketCommands extends Context.Service<
  TicketCommands,
  Readonly<{
    quickCreate: (
      input: QuickCreateTicketInput
    ) => Effect.Effect<
      TicketDetail,
      | Forbidden
      | NotFound
      | Validation
      | MentionInvalid
      | Markdown.MarkdownError,
      ProjectScope
    >
    create: (
      input: CreateTicketInput
    ) => Effect.Effect<
      TicketDetail,
      | Forbidden
      | NotFound
      | Validation
      | MentionInvalid
      | Markdown.MarkdownError,
      ProjectScope
    >
    update: (
      id: string,
      input: UpdateTicketInput,
      sort?: TicketSort,
      expected?: TicketUpdateExpectation
    ) => Effect.Effect<
      TicketUpdateResult,
      Forbidden | TicketReadError | Validation | MentionInvalid | Conflict,
      ProjectScope | ActivityActor
    >
    clearStaleEstimates: () => Effect.Effect<
      ClearStaleEstimatesResult,
      Forbidden | TicketReadError,
      ProjectScope | ActivityActor
    >
    moveInGroup: (
      groupId: string,
      input: UpdateTicketOrderInput
    ) => Effect.Effect<
      GroupDetail,
      | NotFound
      | Forbidden
      | SprintCompletedImmutable
      | Validation
      | Markdown.MarkdownError,
      ProjectScope | ActivityActor
    >
    split: (
      id: string,
      input: SplitTicketInput
    ) => Effect.Effect<
      SplitTicketResult,
      | Conflict
      | Forbidden
      | TicketReadError
      | Validation
      | MentionInvalid
      | SprintCompletedImmutable,
      ProjectScope | ActivityActor
    >
    bulkUpdate: (
      input: BulkUpdateTicketsInput
    ) => Effect.Effect<
      BulkUpdateTicketsResult,
      TicketReadError | Validation | Forbidden | SprintCompletedImmutable,
      ProjectScope | ActivityActor
    >
    move: (
      id: string,
      input: MoveTicketInput
    ) => Effect.Effect<
      MoveTicketResult,
      Conflict | Forbidden | TicketReadError | Validation,
      ProjectScope | ActivityActor | CurrentUser
    >
    remove: (
      id: string,
      options?: DeleteTicketQuery
    ) => Effect.Effect<
      void,
      NotFound | Markdown.MarkdownError,
      ProjectScope | ActivityActor
    >
    archive: (
      id: string,
      reason?: string
    ) => Effect.Effect<
      TicketDetail,
      | Forbidden
      | Conflict
      | TicketReadError
      | MentionInvalid
      | Comments.InvalidCommentBody,
      ProjectScope | ActivityActor
    >
    unarchive: (
      id: string
    ) => Effect.Effect<
      TicketDetail,
      Forbidden | Conflict | TicketReadError,
      ProjectScope | ActivityActor
    >
  }>
>()("@pp/server-core/tickets/TicketCommands") {}

const make = Effect.gen(function* () {
  const ticketDocs = yield* TicketDocs.TicketDocs
  const ticketActivity = yield* TicketActivity.TicketActivity
  const { withTicketDocumentLock } =
    yield* TicketDocumentLock.TicketDocumentLock
  const projects = yield* Projects.Projects
  const projectMembers = yield* ProjectMembers.ProjectMembers
  const projectDocs = yield* ProjectDocs.ProjectDocs
  const ticketIndex = yield* TicketIndex.TicketIndex
  const groups = yield* Groups.Groups
  const db = yield* Db
  const attachments = yield* Attachments.Attachments
  const access = yield* Access.Access
  const figmaLinks = yield* FigmaLinks.FigmaLinks
  const library = yield* Library.Library

  const { gitView, detailOf, readTicket, withMissingAttachments } =
    yield* TicketView.TicketView

  const validateTagsExist = (
    projectId: string,
    requested: ReadonlyArray<string>
  ): Effect.Effect<void, Validation> =>
    Effect.gen(function* () {
      if (requested.length === 0) return
      const rows = yield* db.query.projectTag
        .findMany({
          columns: { name: true },
          where: { projectId }
        })
        .pipe(Effect.orDie)
      const known = new Set<string>(rows.map((r) => r.name))
      const missing = requested.filter((name) => !known.has(name))
      if (missing.length > 0) {
        return yield* new Validation({
          reason: `unknown_tags:${missing.join(",")}`
        })
      }
    })

  const validateStatusExists = (
    projectId: string,
    requested: TicketStatus
  ): Effect.Effect<void, Validation> =>
    Effect.gen(function* () {
      const rows = yield* db.query.projectStatus
        .findMany({
          columns: { slug: true },
          where: { projectId }
        })
        .pipe(Effect.orDie)
      const known = new Set<string>(rows.map((r) => r.slug))
      if (!known.has(requested)) {
        return yield* new Validation({
          reason: `unknown_status:${requested}`
        })
      }
    })

  const validateEstimate = Effect.fnUntraced(function* (
    scope: ProjectScope["Service"],
    estimate: Estimate | null | undefined
  ) {
    if (estimate === undefined || estimate === null) return
    const { estimation } = yield* readProjectDocument({
      db,
      docs: projectDocs,
      project: scope
    })
    if (estimation === "off") {
      return yield* new Validation({ reason: "estimation_off" })
    }
    if (estimate.unit !== estimation) {
      return yield* new Validation({
        reason: `estimate_unit_mismatch:${estimate.unit}:${estimation}`
      })
    }
  })

  const validateBody = (
    body: string,
    project: TicketProject
  ): Effect.Effect<void, NotFound | MentionInvalid, ProjectScope> =>
    validateBodyMentionsWithLookups(body, {
      existingTicketIds: (ticketIds) =>
        ticketIndex.mentionableIds(project, ticketIds),
      memberIds: () => projectMembers.memberIds()
    })

  const validateAssigneesAreMembers = (
    assignees: ReadonlyArray<string>
  ): Effect.Effect<void, Validation, ProjectScope> =>
    Effect.gen(function* () {
      const members = yield* projectMembers.memberIds()
      const invalid = assignees.filter((id) => !members.has(id))
      if (invalid.length > 0) {
        return yield* new Validation({
          reason: `non_member_assignees:${invalid.join(",")}`
        })
      }
    })

  const hierarchyLookups = (
    project: TicketProject,
    viewerId: string
  ): HierarchyLookups => {
    const found = new Map<TicketId, HierarchyNode | undefined>()
    return {
      find: (id) =>
        found.has(id)
          ? Effect.succeed(found.get(id))
          : ticketIndex.list(project, [id]).pipe(
              Effect.map(([entry]) => entry),
              Effect.tap((entry) => Effect.sync(() => found.set(id, entry)))
            ),
      hasChildren: (id) => hasChildren(project, viewerId, id)
    }
  }

  const validateNewParent = (
    project: TicketProject,
    viewerId: string,
    type: TicketType,
    parent: TicketId | undefined
  ): Effect.Effect<void, Validation> =>
    validateHierarchy(hierarchyLookups(project, viewerId), {
      id: null,
      fromType: null,
      type,
      parent,
      parentChanged: parent !== undefined
    })

  const childIds = (
    project: TicketProject,
    viewerId: string,
    id: string
  ): Effect.Effect<ReadonlyArray<string>> =>
    Effect.forEach(
      [false, true],
      (archived) =>
        Effect.gen(function* () {
          const filter = { parent: [makeTicketId(id)], archived }
          const { total } = yield* ticketIndex.count(project, filter, {
            viewerId
          })
          if (total === 0) return []
          const entries = yield* ticketIndex.query(
            project,
            { ...filter, sort: DEFAULT_TICKET_SORT },
            { viewerId, limit: total }
          )
          return entries.map(({ entry }) => entry.id)
        }),
      { concurrency: 2 }
    ).pipe(Effect.map((pages) => pages.flat()))

  const hasChildren = (
    project: TicketProject,
    viewerId: string,
    id: string
  ): Effect.Effect<boolean> =>
    Effect.forEach(
      [false, true],
      (archived) =>
        ticketIndex.count(
          project,
          { parent: [makeTicketId(id)], archived },
          { viewerId }
        ),
      { concurrency: 2 }
    ).pipe(Effect.map((counts) => counts.some(({ total }) => total > 0)))

  const writeWithIdAllocation = (
    project: TicketProject,
    projectKey: ProjectKey,
    buildDocument: (id: TicketId) => TicketDocs.TicketDocument,
    onFileWritten?: (document: TicketDocs.TicketDocument) => void
  ): Effect.Effect<TicketDocs.TicketDocument, Markdown.MarkdownError> =>
    Effect.gen(function* () {
      while (true) {
        const candidate = makeTicketId(
          `${projectKey}-${yield* ticketIndex.reserveTicketNumber(project)}`
        )
        const document = buildDocument(candidate)
        const result = yield* ticketDocs
          .create(project.orgSlug, project.slug, document, (created) =>
            Effect.sync(() => onFileWritten?.(created)).pipe(
              Effect.andThen(
                Effect.all(
                  [
                    attachments.reconcileTicket(
                      project.orgSlug,
                      project.slug,
                      created.id,
                      created.body
                    ),
                    figmaLinks.reconcileTicket(
                      project.orgSlug,
                      project.slug,
                      created.id,
                      created.title,
                      created.body
                    )
                  ],
                  { concurrency: 2, discard: true }
                )
              ),
              Effect.andThen(ticketIndex.upsertTicket(project, created))
            )
          )
          .pipe(
            Effect.map(() => "ok" as const),
            Effect.catchTag("TicketIdTaken", () =>
              Effect.succeed("retry" as const)
            )
          )
        if (result === "ok") return document
      }
    })

  const expansionFor = (
    project: TicketProject,
    template: TemplateKey | null | undefined
  ): Effect.Effect<
    Library.TemplateExpansion | null,
    NotFound | Validation | Markdown.MarkdownError
  > =>
    template === undefined || template === null
      ? Effect.succeed(null)
      : library.expandForCreate(project.orgSlug, project.slug, template)

  const quickCreate = Effect.fn("TicketCommands.quickCreate")(function* (
    input: QuickCreateTicketInput
  ) {
    const scope = yield* ProjectScope
    const { userId: ownerId, projectId } = scope
    yield* requireTicketChange({
      content: false,
      status: input.status !== undefined && input.status !== DEFAULT_STATUS,
      assignees: false
    })
    const [, expansion, projectKey, view] = yield* Effect.all(
      [
        input.status === undefined
          ? Effect.void
          : validateStatusExists(projectId, input.status),
        expansionFor(scope, input.template),
        projects.key(),
        gitView
      ],
      { concurrency: "unbounded" }
    )
    const tags = expansion?.tags ?? []
    const body = expansion?.body ?? ""
    const type = input.type ?? expansion?.type ?? "other"
    yield* Effect.all(
      [
        validateTagsExist(projectId, tags),
        body === "" ? Effect.void : validateBody(body, scope),
        validateNewParent(scope, ownerId, type, input.parent)
      ],
      { concurrency: "unbounded", discard: true }
    )
    const now = yield* DateTime.nowAsDate
    const document = yield* writeWithIdAllocation(scope, projectKey, (id) => ({
      id,
      title: input.title,
      status: input.status ?? DEFAULT_STATUS,
      type,
      priority: expansion?.priority ?? "med",
      tags: [...tags],
      branch: null,
      pr: null,
      prState: null,
      lastTransitionedPr: null,
      assignees: [],
      parent: input.parent,
      archivedAt: null,
      createdBy: ownerId,
      createdAt: now,
      updatedBy: ownerId,
      updatedAt: now,
      body,
      commentsRegion: ""
    }))
    return yield* detailOf(document, view)
  })

  const create = Effect.fn("TicketCommands.create")(function* (
    input: CreateTicketInput
  ) {
    const scope = yield* ProjectScope
    const { orgSlug, slug, userId: ownerId, projectId } = scope
    yield* requireTicketChange({
      content: false,
      status: input.status !== undefined && input.status !== DEFAULT_STATUS,
      assignees: (input.assignees ?? []).length > 0
    })
    const [, , , expansion, projectKey, view] = yield* Effect.all(
      [
        input.status === undefined
          ? Effect.void
          : validateStatusExists(projectId, input.status),
        input.assignees === undefined || input.assignees.length === 0
          ? Effect.void
          : validateAssigneesAreMembers(input.assignees),
        validateEstimate(scope, input.estimate),
        expansionFor(scope, input.template),
        projects.key(),
        gitView
      ],
      { concurrency: "unbounded" }
    )
    const tags = input.tags ?? expansion?.tags ?? []
    const type = input.type ?? expansion?.type ?? "other"
    const [, body] = yield* Effect.all(
      [
        validateTagsExist(projectId, tags),
        library
          .resolveSynced(
            orgSlug,
            slug,
            normalizeLineEndings(input.body ?? expansion?.body ?? "")
          )
          .pipe(
            Effect.tap((body) =>
              body === "" ? Effect.void : validateBody(body, scope)
            )
          ),
        validateNewParent(scope, ownerId, type, input.parent)
      ],
      { concurrency: "unbounded" }
    )
    const now = yield* DateTime.nowAsDate
    const document = yield* writeWithIdAllocation(scope, projectKey, (id) => ({
      id,
      title: input.title,
      status: input.status ?? DEFAULT_STATUS,
      type,
      priority: input.priority ?? expansion?.priority ?? "med",
      ...(input.estimate ? { estimate: input.estimate } : {}),
      tags: [...tags],
      branch: null,
      pr: null,
      prState: null,
      lastTransitionedPr: null,
      assignees: input.assignees !== undefined ? [...input.assignees] : [],
      parent: input.parent,
      archivedAt: null,
      createdBy: ownerId,
      createdAt: now,
      updatedBy: ownerId,
      updatedAt: now,
      body,
      commentsRegion: ""
    }))
    return yield* detailOf(document, view)
  })

  const update = Effect.fn("TicketCommands.update")(function* (
    id: string,
    input: UpdateTicketInput,
    sort?: TicketSort,
    expected?: TicketUpdateExpectation
  ) {
    const scope = yield* ProjectScope
    const { orgSlug, slug, userId, projectId } = scope
    const readsProjectDocument =
      input.estimate !== undefined && input.estimate !== null
    yield* Effect.all(
      [
        validateEstimate(scope, input.estimate),
        sort?.key === "estimate" && !readsProjectDocument
          ? readProjectDocument({ db, docs: projectDocs, project: scope })
          : Effect.void
      ],
      { concurrency: 2, discard: true }
    )
    return yield* withTicketDocumentLock(
      orgSlug,
      slug,
      id,
      Effect.gen(function* () {
        const [, , view, body] = yield* Effect.all(
          [
            input.status === undefined
              ? Effect.void
              : validateStatusExists(projectId, input.status),
            input.tags === undefined
              ? Effect.void
              : validateTagsExist(projectId, input.tags),
            gitView,
            input.body === undefined
              ? Effect.succeed(undefined)
              : library
                  .resolveSynced(
                    orgSlug,
                    slug,
                    normalizeLineEndings(input.body)
                  )
                  .pipe(Effect.tap((body) => validateBody(body, scope)))
          ],
          { concurrency: "unbounded" }
        )

        const next = yield* ticketDocs.update(
          orgSlug,
          slug,
          id,
          (existing) =>
            Effect.gen(function* () {
              if (
                expected?.updatedAt !== undefined &&
                existing.updatedAt.getTime() !== expected.updatedAt.getTime()
              ) {
                return yield* new Conflict({
                  reason: "ticket_updated_since_read"
                })
              }
              if (
                expected?.body !== undefined &&
                (yield* library.resolveSynced(orgSlug, slug, existing.body)) !==
                  expected.body
              ) {
                return yield* new Validation({
                  reason: "ticket_body_changed"
                })
              }
              const next = applyTicketPatch(
                existing,
                { ...input, body },
                userId,
                existing.updatedAt
              )
              yield* requireTicketChange(ticketChangeOf(existing, next))
              if (input.assignees !== undefined) {
                const existingSet = new Set(existing.assignees)
                const newcomers = input.assignees.filter(
                  (assigneeId) => !existingSet.has(assigneeId)
                )
                if (newcomers.length > 0) {
                  yield* validateAssigneesAreMembers(newcomers)
                }
              }
              yield* validateHierarchy(
                hierarchyLookups(scope, userId),
                hierarchyChangeOf(existing, next)
              )
              if (next.type === "epic" && existing.type !== "epic") {
                const sprints = openSprintIdsOf(
                  yield* groups.list(),
                  existing.id
                )
                if (breaksEpicSprintRule(existing, next, sprints, sprints)) {
                  return yield* new Validation({ reason: "epic_in_sprint" })
                }
              }
              return { ...next, updatedAt: yield* DateTime.nowAsDate }
            }),
          (next) =>
            (input.body === undefined
              ? Effect.void
              : Effect.all(
                  [
                    attachments.reconcileTicket(orgSlug, slug, id, next.body),
                    figmaLinks.reconcileTicket(
                      orgSlug,
                      slug,
                      id,
                      next.title,
                      next.body
                    )
                  ],
                  { concurrency: 2, discard: true }
                )
            ).pipe(Effect.andThen(ticketIndex.upsertTicket(scope, next)))
        )

        const [ticket, orderKey] = yield* Effect.all(
          [
            detailOf(next, view).pipe(
              Effect.flatMap((detail) =>
                withMissingAttachments(orgSlug, detail)
              )
            ),
            sort === undefined
              ? Effect.succeed(null)
              : ticketIndex.orderKeyFor(scope, id, sort)
          ],
          { concurrency: 2 }
        )
        return { ticket, orderKey }
      })
    )
  })

  const clearStaleEstimates = Effect.fn("TicketCommands.clearStaleEstimates")(
    function* () {
      const scope = yield* ProjectScope
      yield* requireTicketChange({ content: true })
      const { estimation } = yield* readProjectDocument({
        db,
        docs: projectDocs,
        project: scope
      })
      const batches = yield* Effect.forEach([false, true], (archived) =>
        Effect.gen(function* () {
          const query = { estimate: ["stale" as const], archived }
          const { total } = yield* ticketIndex.count(scope, query, {
            viewerId: scope.userId
          })
          if (total === 0) return []
          return yield* ticketIndex.query(
            scope,
            { ...query, sort: DEFAULT_TICKET_SORT },
            { viewerId: scope.userId, limit: total }
          )
        })
      )
      const stale = batches.flat()
      let cleared = 0
      yield* Effect.forEach(
        stale,
        ({ entry }) =>
          withTicketDocumentLock(
            scope.orgSlug,
            scope.slug,
            entry.id,
            Effect.gen(function* () {
              let changed = false
              yield* ticketDocs.update(
                scope.orgSlug,
                scope.slug,
                entry.id,
                Effect.fnUntraced(function* (current) {
                  const latest = yield* projectDocs.read(
                    scope.orgSlug,
                    scope.slug
                  )
                  if (
                    latest.estimation !== estimation ||
                    !isStaleEstimate(
                      current.estimate ?? null,
                      latest.estimation
                    )
                  )
                    return current
                  changed = true
                  return {
                    ...current,
                    estimate: undefined,
                    updatedBy: scope.userId,
                    updatedAt: yield* DateTime.nowAsDate
                  }
                }),
                (next) => ticketIndex.upsertTicket(scope, next)
              )
              if (changed) cleared++
            })
          ),
        { concurrency: 4, discard: true }
      )
      return { cleared }
    }
  )

  const moveInGroup = Effect.fn("TicketCommands.moveInGroup")(function* (
    groupId: string,
    { status, ...position }: UpdateTicketOrderInput
  ) {
    const scope = yield* ProjectScope
    const { orgSlug, slug, userId, projectId } = scope
    if (status !== undefined) {
      yield* requireTicketChange({
        content: false,
        status: true,
        assignees: false
      })
      yield* validateStatusExists(projectId, status)
    }
    if (status === undefined) {
      return yield* groups.updateTicketOrder(groupId, position)
    }
    return yield* groups.updateTicketOrder(
      groupId,
      position,
      withTicketDocumentLock(
        orgSlug,
        slug,
        position.ticketId,
        ticketDocs
          .update(
            orgSlug,
            slug,
            position.ticketId,
            (existing) =>
              existing.status === status
                ? Effect.succeed(existing)
                : DateTime.nowAsDate.pipe(
                    Effect.map((now) => ({
                      ...existing,
                      status,
                      updatedBy: userId,
                      updatedAt: now
                    }))
                  ),
            (next) => ticketIndex.upsertTicket(scope, next)
          )
          .pipe(
            Effect.asVoid,
            Effect.catchTag("MalformedTicketDocument", () =>
              Effect.fail(new NotFound())
            )
          )
      )
    )
  })

  const restoreTicket = (
    project: TicketProject,
    id: string,
    original: TicketDocs.TicketDocument
  ) =>
    ticketDocs
      .write(project.orgSlug, project.slug, id, original)
      .pipe(Effect.andThen(ticketIndex.upsertTicket(project, original)))

  const discardSplitResult = (
    project: TicketProject,
    document: TicketDocs.TicketDocument
  ) =>
    ticketDocs
      .remove(
        project.orgSlug,
        project.slug,
        document.id,
        attachments
          .reconcileTicket(project.orgSlug, project.slug, document.id, "")
          .pipe(
            Effect.andThen(
              figmaLinks.reconcileTicket(
                project.orgSlug,
                project.slug,
                document.id,
                "",
                ""
              )
            ),
            Effect.andThen(ticketIndex.deleteTicket(project, document.id))
          )
      )
      .pipe(Effect.ignore)

  const restoreSplitDocuments = (
    project: TicketProject,
    id: string,
    original: TicketDocs.TicketDocument,
    created: ReadonlyArray<TicketDocs.TicketDocument>
  ) =>
    Effect.forEach(
      created,
      (document) => discardSplitResult(project, document),
      { discard: true }
    ).pipe(Effect.andThen(restoreTicket(project, id, original)))

  const split = Effect.fn("TicketCommands.split")(function* (
    id: string,
    input: SplitTicketInput
  ) {
    const scope = yield* ProjectScope
    const { orgSlug, slug, userId, projectId } = scope
    const [retainedInput, ...newInputs] = input.results
    if (retainedInput === undefined || newInputs.length === 0) {
      return yield* new Validation({ reason: "split_needs_two_results" })
    }

    const projectKey = yield* projects.key()
    const view = yield* gitView
    const source = yield* readTicket(scope, id)
    yield* requireSplit(source, retainedInput, newInputs)

    const sourceAssignees = new Set(source.assignees)
    const newcomers = [
      ...new Set(input.results.flatMap((result) => result.assignees))
    ].filter((assignee) => !sourceAssignees.has(assignee))
    if (newcomers.length > 0) {
      yield* validateAssigneesAreMembers(newcomers)
    }
    yield* Effect.forEach(
      [...new Set(input.results.map((result) => result.status))],
      (status) => validateStatusExists(projectId, status),
      { discard: true }
    )

    const originalId = makeTicketId(id)
    if (
      input.results.some(
        (result) => result.type === "epic" && result.sprintId !== null
      )
    ) {
      return yield* new Validation({ reason: "epic_in_sprint" })
    }
    const originalSprint = (yield* groups.list()).find(
      (group) =>
        group.kind === "sprint" &&
        group.completedAt === null &&
        group.tickets.includes(originalId)
    )
    const originalSprintId = originalSprint?.id ?? null
    const retainedMoves = retainedInput.sprintId !== originalSprintId
    if (retainedMoves && originalSprintId !== null) {
      yield* requirePolicy((scope) =>
        GroupPolicy.can(scope, "sprint", "remove_ticket")
      )
    }
    const sprintTargets = [
      retainedMoves ? retainedInput.sprintId : null,
      ...newInputs.map((result) =>
        result.sprintId === originalSprintId ? null : result.sprintId
      )
    ].filter((sprintId) => sprintId !== null)
    if (sprintTargets.length > 0) {
      yield* groups.ensureSprintAssignable(sprintTargets)
    }
    const originalSprintIndex =
      originalSprint?.tickets.indexOf(originalId) ?? -1
    const originalSprintAnchor = originalSprint
      ? originalSprintIndex === 0
        ? null
        : originalSprint.tickets[originalSprintIndex - 1]
      : undefined

    const written = yield* withTicketDocumentLock(
      orgSlug,
      slug,
      id,
      Effect.gen(function* () {
        const original = yield* ticketDocs.read(orgSlug, slug, id)
        yield* requireSplit(original, retainedInput, newInputs)
        yield* validateHierarchy(hierarchyLookups(scope, userId), {
          id: original.id,
          fromType: original.type,
          type: retainedInput.type,
          parent: original.parent,
          parentChanged: false
        })
        const now = yield* DateTime.nowAsDate
        const persisted: Array<TicketDocs.TicketDocument> = []

        const run = Effect.gen(function* () {
          const createdDocuments: Array<TicketDocs.TicketDocument> = []
          for (const result of newInputs) {
            createdDocuments.push(
              yield* writeWithIdAllocation(
                scope,
                projectKey,
                (newId) => ({
                  id: newId,
                  title: result.title,
                  status: result.status,
                  type: result.type,
                  priority: result.priority,
                  tags: original.tags,
                  branch: null,
                  branchAutoLinkDisabled: true,
                  pr: null,
                  prState: null,
                  lastTransitionedPr: null,
                  splitFrom: originalId,
                  parent: result.type === "epic" ? undefined : original.parent,
                  assignees: [...result.assignees],
                  archivedAt: original.archivedAt,
                  createdBy: userId,
                  createdAt: now,
                  updatedBy: userId,
                  updatedAt: now,
                  body: `Split from [${originalId}](${formatMentionHref("ticket", originalId)})
`,
                  commentsRegion: ""
                }),
                (document) => persisted.push(document)
              )
            )
          }

          const retained = yield* ticketDocs.update(
            orgSlug,
            slug,
            id,
            (existing) =>
              Effect.succeed({
                ...existing,
                title: retainedInput.title,
                type: retainedInput.type,
                status: retainedInput.status,
                priority: retainedInput.priority,
                assignees: [...retainedInput.assignees],
                updatedBy: userId,
                updatedAt: now
              }),
            (next) => ticketIndex.upsertTicket(scope, next),
            { silent: true }
          )

          return { original, retained, createdDocuments }
        })

        return yield* run.pipe(
          Effect.onError(() =>
            restoreSplitDocuments(scope, id, original, persisted).pipe(
              Effect.ignoreCause
            )
          )
        )
      })
    )

    let sprintAnchor = originalId
    const sprintAssignments = [
      ...(retainedMoves
        ? [
            {
              ticketId: originalId,
              sprintId: retainedInput.sprintId,
              from: originalSprintId
            }
          ]
        : []),
      ...written.createdDocuments.map((document, index) => ({
        ticketId: document.id,
        sprintId: newInputs[index].sprintId,
        from: null
      }))
    ]
    yield* Effect.forEach(
      sprintAssignments,
      ({ ticketId, sprintId, from }) =>
        groups
          .setSprintMembership(orgSlug, slug, ticketId, sprintId, {
            after: sprintAnchor,
            from
          })
          .pipe(
            Effect.tap(() =>
              Effect.sync(() => {
                sprintAnchor = ticketId
              })
            )
          ),
      { discard: true }
    ).pipe(
      Effect.onError(() =>
        Effect.forEach(
          written.createdDocuments,
          (document) =>
            groups
              .setSprintMembership(orgSlug, slug, document.id, null)
              .pipe(
                Effect.catchCause((cause) =>
                  Effect.logError("split: sprint rollback failed", cause)
                )
              ),
          { discard: true }
        ).pipe(
          Effect.andThen(
            retainedMoves
              ? groups
                  .setSprintMembership(
                    orgSlug,
                    slug,
                    originalId,
                    originalSprintId,
                    { after: originalSprintAnchor }
                  )
                  .pipe(
                    Effect.catchCause((cause) =>
                      Effect.logError("split: sprint rollback failed", cause)
                    )
                  )
              : Effect.void
          ),
          Effect.andThen(
            restoreSplitDocuments(
              scope,
              id,
              written.original,
              written.createdDocuments
            ).pipe(
              Effect.catchCause((cause) =>
                Effect.logError("split: ticket rollback failed", cause)
              )
            )
          )
        )
      )
    )

    yield* withTicketDocumentLock(
      orgSlug,
      slug,
      id,
      ticketActivity.record(
        orgSlug,
        slug,
        {
          kind: "ticket",
          id,
          content: TicketDocs.ticketFileContent(written.retained)
        },
        [
          ...ticketChanges(written.original, written.retained),
          {
            kind: "split" as const,
            into: written.createdDocuments.map((document) => document.id)
          }
        ].map((change) => ({ ticketId: written.retained.id, change })),
        null,
        Effect.void
      )
    )

    return yield* Effect.all(
      {
        retained: detailOf(written.retained, view),
        created: Effect.forEach(
          written.createdDocuments,
          (document) => detailOf(document, view),
          { concurrency: 8 }
        )
      },
      { concurrency: 2 }
    )
  })

  const moveDestinationOf = Effect.fnUntraced(function* (
    source: ProjectScope["Service"],
    destination: ProjectScope["Service"]
  ) {
    const [statuses, tags, memberIds, sourceDoc, destinationDoc, projectKey] =
      yield* Effect.all(
        [
          db
            .select({ slug: schema.projectStatus.slug })
            .from(schema.projectStatus)
            .where(eq(schema.projectStatus.projectId, destination.projectId))
            .orderBy(asc(schema.projectStatus.orderKey))
            .pipe(Effect.orDie),
          db.query.projectTag
            .findMany({
              columns: { name: true },
              where: { projectId: destination.projectId }
            })
            .pipe(Effect.orDie),
          projectMembers.memberIds(),
          readProjectDocument({ db, docs: projectDocs, project: source }),
          readProjectDocument({ db, docs: projectDocs, project: destination }),
          projects.key()
        ],
        { concurrency: 6 }
      ).pipe(Effect.provideService(ProjectScope, destination))
    const sameRepository =
      sourceDoc.github !== null &&
      destinationDoc.github !== null &&
      sourceDoc.github.repoOwner.toLowerCase() ===
        destinationDoc.github.repoOwner.toLowerCase() &&
      sourceDoc.github.repoName.toLowerCase() ===
        destinationDoc.github.repoName.toLowerCase()
    return {
      projectKey,
      sameRepository,
      plan: {
        statuses: statuses.map((row) => row.slug),
        tags: tags.map((row) => row.name),
        memberIds,
        estimation: destinationDoc.estimation
      } satisfies MoveDestination
    }
  })

  const reserveFreeTicketId = (
    project: TicketProject,
    projectKey: ProjectKey
  ): Effect.Effect<TicketId, Markdown.MarkdownError> =>
    Effect.gen(function* () {
      while (true) {
        const candidate = makeTicketId(
          `${projectKey}-${yield* ticketIndex.reserveTicketNumber(project)}`
        )
        const taken = yield* ticketDocs
          .readRaw(project.orgSlug, project.slug, candidate)
          .pipe(
            Effect.as(true),
            Effect.catchTag("NotFound", () => Effect.succeed(false))
          )
        if (!taken) return candidate
      }
    })

  const withoutGitLink = (
    document: TicketDocs.TicketDocument
  ): TicketDocs.TicketDocument => ({
    ...document,
    branch: null,
    branchAutoLinkDisabled: undefined,
    pr: null,
    prState: null,
    prDraft: undefined,
    prBase: undefined,
    lastTransitionedPr: null,
    stack: undefined,
    ignoredBranches: undefined
  })

  const rehomeTicketRows = (
    source: TicketProject,
    destination: TicketProject,
    moved: ReadonlyArray<MovedTicket>
  ): Effect.Effect<void> =>
    db
      .transaction(() =>
        Effect.forEach(
          moved,
          ({ from, to }) =>
            Effect.gen(function* () {
              const target = { projectId: destination.projectId, ticketId: to }
              yield* db
                .update(schema.attachmentIndex)
                .set(target)
                .where(
                  and(
                    eq(schema.attachmentIndex.projectId, source.projectId),
                    eq(schema.attachmentIndex.ticketId, from)
                  )
                )
              yield* db
                .delete(schema.attachmentReference)
                .where(
                  and(
                    eq(schema.attachmentReference.projectId, source.projectId),
                    eq(schema.attachmentReference.ticketId, from)
                  )
                )
              yield* db
                .update(schema.commentIndex)
                .set(target)
                .where(
                  and(
                    eq(schema.commentIndex.projectId, source.projectId),
                    eq(schema.commentIndex.ticketId, from)
                  )
                )
              yield* db
                .update(schema.ticketActivity)
                .set(target)
                .where(
                  and(
                    eq(schema.ticketActivity.projectId, source.projectId),
                    eq(schema.ticketActivity.ticketId, from)
                  )
                )
            }),
          { discard: true }
        )
      )
      .pipe(Effect.orDie)

  const repointMentionsOfMovedTickets = (
    source: TicketProject,
    context: MoveMentionContext
  ) =>
    Effect.gen(function* () {
      const ids = yield* ticketDocs.listIds(source.orgSlug, source.slug)
      const needles = [...context.moved.keys()].map(
        (id) => `](${formatMentionHref("ticket", id)})`
      )
      yield* Effect.forEach(
        ids,
        (id) =>
          Effect.gen(function* () {
            const raw = yield* ticketDocs.readRaw(
              source.orgSlug,
              source.slug,
              id
            )
            if (!needles.some((needle) => raw.content.includes(needle))) return
            yield* withTicketDocumentLock(
              source.orgSlug,
              source.slug,
              id,
              ticketDocs.update(
                source.orgSlug,
                source.slug,
                id,
                (existing) => {
                  const body = rewriteMentionsOfMovedTickets(
                    existing.body,
                    context,
                    source.slug
                  )
                  const commentsRegion = rewriteMentionsOfMovedTickets(
                    existing.commentsRegion,
                    context,
                    source.slug
                  )
                  return Effect.succeed(
                    body === existing.body &&
                      commentsRegion === existing.commentsRegion
                      ? existing
                      : { ...existing, body, commentsRegion }
                  )
                },
                undefined,
                { silent: true }
              )
            )
          }).pipe(
            Effect.catchCause((cause) =>
              Effect.logError("move: repointing a mention failed", {
                orgSlug: source.orgSlug,
                slug: source.slug,
                ticketId: id,
                cause
              })
            )
          ),
        { concurrency: 8, discard: true }
      )
    }).pipe(
      Effect.catchCause((cause) =>
        Effect.logError("move: repointing mentions failed", cause)
      )
    )

  const move = Effect.fn("TicketCommands.move")(function* (
    id: string,
    input: MoveTicketInput
  ) {
    const source = yield* ProjectScope
    const { orgSlug, userId } = source
    if (input.toProject === source.slug) {
      return yield* new Validation({ reason: "move_same_project" })
    }
    const destination = yield* access.project(orgSlug, input.toProject)
    if (!destination.permissions.can({ ticket: ["create"] })) {
      return yield* new Forbidden()
    }
    const { projectKey, sameRepository, plan } = yield* moveDestinationOf(
      source,
      destination
    )
    if (plan.statuses.length === 0) {
      return yield* new Validation({ reason: "move_destination_no_statuses" })
    }
    if (input.status !== undefined && !plan.statuses.includes(input.status)) {
      return yield* new Validation({
        reason: `unknown_status:${input.status}`
      })
    }

    const rootId = makeTicketId(id)
    const root = yield* readTicket(source, id)
    const children = yield* childIds(source, userId, id)
    if (root.type === "epic" && children.length > 0) {
      return yield* new Validation({ reason: "move_epic_has_tickets" })
    }
    const sourceIds = [rootId, ...children.map((child) => makeTicketId(child))]

    const result = yield* withTicketLocks(
      source,
      sourceIds,
      Effect.gen(function* () {
        const originals = yield* Effect.forEach(sourceIds, (sourceId) =>
          ticketDocs.read(orgSlug, source.slug, sourceId)
        )
        const moved: Array<MovedTicket> = []
        for (const original of originals) {
          moved.push({
            from: original.id,
            to: yield* reserveFreeTicketId(destination, projectKey)
          })
        }
        const mentions: MoveMentionContext = {
          fromProject: source.slug,
          toProject: destination.slug,
          moved: new Map(moved.map(({ from, to }) => [from, to]))
        }
        const newIdOf = (sourceId: TicketId | undefined) =>
          sourceId === undefined ? undefined : mentions.moved.get(sourceId)
        const now = yield* DateTime.nowAsDate
        const documents = originals.map((original, index) => {
          const fields = planTicketMove(
            original,
            plan,
            original.id === rootId ? input.status : undefined
          )
          const linked = sameRepository ? original : withoutGitLink(original)
          return {
            ...linked,
            id: moved[index].to,
            status: makeTicketStatus(fields.status ?? plan.statuses[0]),
            tags: fields.tags,
            assignees: [...fields.assignees],
            estimate: fields.keepsEstimate ? original.estimate : undefined,
            parent:
              original.id === rootId
                ? undefined
                : makeOptionalTicketId(newIdOf(original.parent)),
            splitFrom: makeOptionalTicketId(newIdOf(original.splitFrom)),
            movedFrom: [
              ...(original.movedFrom ?? []),
              formatMovedFrom(source.slug, original.id)
            ],
            updatedBy: userId,
            updatedAt: now,
            body: rewriteMentionsInMovedTicket(original.body, mentions),
            commentsRegion: rewriteMentionsInMovedTicket(
              original.commentsRegion,
              mentions
            )
          } satisfies TicketDocs.TicketDocument
        })

        const created: Array<TicketDocs.TicketDocument> = []
        yield* Effect.forEach(
          documents,
          (document) =>
            ticketDocs
              .create(orgSlug, destination.slug, document, (persisted) =>
                Effect.sync(() => created.push(persisted)).pipe(
                  Effect.andThen(
                    Effect.all(
                      [
                        attachments.reconcileTicket(
                          orgSlug,
                          destination.slug,
                          persisted.id,
                          persisted.body
                        ),
                        figmaLinks.reconcileTicket(
                          orgSlug,
                          destination.slug,
                          persisted.id,
                          persisted.title,
                          persisted.body
                        )
                      ],
                      { concurrency: 2, discard: true }
                    )
                  ),
                  Effect.andThen(
                    ticketIndex.upsertTicket(destination, persisted)
                  )
                )
              )
              .pipe(
                Effect.catchTag("TicketIdTaken", () =>
                  Effect.fail(new Conflict({ reason: "move_id_taken" }))
                )
              ),
          { discard: true }
        ).pipe(
          Effect.onError(() =>
            Effect.forEach(
              created,
              (document) => discardSplitResult(destination, document),
              { discard: true }
            )
          )
        )

        yield* Effect.gen(function* () {
          yield* Effect.forEach(
            sourceIds,
            (sourceId) =>
              groups.removeTicketFromAllGroups(orgSlug, source.slug, sourceId),
            { discard: true }
          )
          yield* rehomeTicketRows(source, destination, moved)
          yield* Effect.forEach(
            documents,
            (document, index) =>
              ticketActivity.record(
                orgSlug,
                destination.slug,
                {
                  kind: "ticket",
                  id: document.id,
                  content: TicketDocs.ticketFileContent(document)
                },
                [
                  {
                    ticketId: document.id,
                    change: {
                      kind: "moved" as const,
                      fromProject: source.slug,
                      fromId: moved[index].from
                    }
                  }
                ],
                null,
                Effect.void
              ),
            { discard: true }
          )
          yield* Effect.forEach(
            originals,
            (original) => discardSplitResult(source, original),
            { discard: true }
          )
        }).pipe(
          Effect.catchCause((cause) =>
            Effect.logError("move: leaving the source project failed", {
              orgSlug,
              from: source.slug,
              to: destination.slug,
              moved,
              cause
            })
          ),
          Effect.uninterruptible
        )

        return { moved, mentions }
      })
    )

    yield* repointMentionsOfMovedTickets(source, result.mentions)

    return {
      projectSlug: makeSlug(destination.slug),
      id: result.moved[0].to,
      moved: result.moved
    } satisfies MoveTicketResult
  })

  const remove = Effect.fn("TicketCommands.remove")(function* (
    id: string,
    options?: DeleteTicketQuery
  ): Effect.fn.Return<
    void,
    NotFound | Markdown.MarkdownError,
    ProjectScope | ActivityActor
  > {
    const scope = yield* ProjectScope
    const { orgSlug, slug, userId } = scope
    yield* groups.removeTicketFromAllGroups(orgSlug, slug, id)
    yield* withTicketDocumentLock(
      orgSlug,
      slug,
      id,
      ticketDocs.remove(
        orgSlug,
        slug,
        id,
        Effect.all(
          [
            attachments.reconcileTicket(orgSlug, slug, id, ""),
            figmaLinks.reconcileTicket(orgSlug, slug, id, "", "")
          ],
          { concurrency: 2, discard: true }
        ).pipe(Effect.andThen(ticketIndex.deleteTicket(scope, id)))
      )
    )
    const children = yield* childIds(scope, userId, id)
    if (options?.cascadeSubTickets === true) {
      yield* Effect.forEach(
        children,
        (childId) =>
          remove(childId, options).pipe(
            Effect.catchTag("NotFound", () => Effect.void)
          ),
        { discard: true }
      )
    } else {
      yield* releaseChildren(scope, userId, id, children)
    }
  })

  const releaseChildren = (
    project: TicketProject,
    userId: string,
    parentId: string,
    children: ReadonlyArray<string>
  ) =>
    Effect.gen(function* () {
      const now = yield* DateTime.nowAsDate
      yield* Effect.forEach(
        children,
        (childId) =>
          withTicketDocumentLock(
            project.orgSlug,
            project.slug,
            childId,
            ticketDocs.update(
              project.orgSlug,
              project.slug,
              childId,
              (existing) =>
                Effect.succeed({
                  ...existing,
                  parent: undefined,
                  updatedBy: userId,
                  updatedAt: now
                }),
              (next) => ticketIndex.upsertTicket(project, next)
            )
          ).pipe(
            Effect.catchCause((cause) =>
              Effect.logError("remove: releasing child ticket failed", {
                orgSlug: project.orgSlug,
                slug: project.slug,
                parentId,
                childId,
                cause
              })
            )
          ),
        { concurrency: 4, discard: true }
      )
    })

  const withTicketLocks = <A, E, R>(
    project: TicketProject,
    ids: ReadonlyArray<string>,
    effect: Effect.Effect<A, E, R>
  ): Effect.Effect<A, E, R> =>
    ids
      .toSorted()
      .reduceRight(
        (inner, id) =>
          withTicketDocumentLock(project.orgSlug, project.slug, id, inner),
        effect
      )

  const bulkUpdate = Effect.fn("TicketCommands.bulkUpdate")(function* (
    input: BulkUpdateTicketsInput
  ) {
    const scope = yield* ProjectScope
    const { orgSlug, slug, userId, projectId } = scope
    const ids = [...new Set(input.tickets)]
    const { sprint, ...fields } = input.patch
    const touchesTickets = Object.keys(fields).length > 0
    const [, , , , allGroups, view] = yield* Effect.all(
      [
        fields.status === undefined
          ? Effect.void
          : validateStatusExists(projectId, fields.status),
        fields.tags === undefined
          ? Effect.void
          : validateTagsExist(projectId, fields.tags),
        validateEstimate(scope, fields.estimate),
        sprint === undefined || sprint === null
          ? Effect.void
          : groups.ensureSprintAssignable([sprint]),
        groups.list(),
        gitView
      ],
      { concurrency: "unbounded" }
    )
    const openSprints = allGroups.filter(
      (group) => group.kind === "sprint" && group.completedAt === null
    )

    const written: Array<
      Readonly<{
        original: TicketDocs.TicketDocument
        next: TicketDocs.TicketDocument
      }>
    > = []
    const revertWritten = Effect.suspend(() =>
      Effect.forEach(
        written,
        ({ original, next }) =>
          Effect.gen(function* () {
            const current = yield* ticketDocs.read(orgSlug, slug, next.id)
            const reverted = revertTicketPatch(original, next, current)
            if (reverted !== null) {
              yield* restoreTicket(scope, next.id, reverted)
            }
          }).pipe(Effect.ignore),
        { discard: true }
      )
    )
    const rejoinSprints = (
      left: ReadonlyArray<
        Readonly<{
          group: (typeof openSprints)[number]
          leaving: ReadonlyArray<string>
        }>
      >
    ) =>
      Effect.forEach(
        left,
        ({ group, leaving }) =>
          Effect.forEach(
            group.tickets.flatMap((ticketId, index) =>
              leaving.includes(ticketId)
                ? [
                    {
                      ticketId,
                      after: index === 0 ? null : group.tickets[index - 1]
                    }
                  ]
                : []
            ),
            ({ ticketId, after }) =>
              groups
                .setSprintMembership(orgSlug, slug, ticketId, group.id, {
                  after,
                  from: null
                })
                .pipe(
                  Effect.catchCause((cause) =>
                    Effect.logError(
                      "bulk update: sprint rollback failed",
                      cause
                    )
                  )
                ),
            { discard: true }
          ),
        { discard: true }
      )
    const planSprint = Effect.gen(function* () {
      if (sprint === undefined) return null
      if (sprint !== null) return yield* groups.addTickets(sprint, ids)
      const left: Array<
        Readonly<{
          group: (typeof openSprints)[number]
          leaving: ReadonlyArray<string>
        }>
      > = []
      yield* Effect.gen(function* () {
        for (const group of openSprints) {
          const leaving = group.tickets.filter((id) => ids.includes(id))
          if (leaving.length === 0) continue
          yield* groups.removeTickets(group.id, leaving)
          left.push({ group, leaving })
        }
      }).pipe(Effect.onError(() => rejoinSprints(left)))
      return null
    })
    const nexts = yield* withTicketLocks(
      scope,
      ids,
      Effect.gen(function* () {
        const originals = yield* Effect.forEach(
          ids,
          (id) => ticketDocs.read(orgSlug, slug, id),
          { concurrency: 8 }
        )
        const now = yield* DateTime.nowAsDate
        const patched = originals.map((existing) =>
          applyTicketPatch(existing, fields, userId, now)
        )
        const changes = originals.map((existing, index) =>
          fieldChangesOf(existing, patched[index])
        )
        if (touchesTickets) {
          yield* requireTicketChange(batchChangeOf(changes))
        }
        const newcomers = [
          ...new Set(
            originals.flatMap((existing, index) =>
              patched[index].assignees.filter(
                (assignee) => !existing.assignees.includes(assignee)
              )
            )
          )
        ]
        if (newcomers.length > 0) {
          yield* validateAssigneesAreMembers(newcomers)
        }
        const lookups = hierarchyLookups(scope, userId)
        for (const [index, existing] of originals.entries()) {
          yield* validateHierarchy(
            lookups,
            hierarchyChangeOf(existing, patched[index])
          )
          const sprintsBefore = openSprintIdsOf(openSprints, existing.id)
          const sprintsAfter =
            sprint === undefined
              ? sprintsBefore
              : sprint === null
                ? []
                : [sprint]
          if (
            breaksEpicSprintRule(
              existing,
              patched[index],
              sprintsBefore,
              sprintsAfter
            )
          ) {
            return yield* new Validation({ reason: "epic_in_sprint" })
          }
        }
        const nexts = originals.map((existing, index) =>
          touchesTickets && !isUnchanged(changes[index])
            ? patched[index]
            : existing
        )

        if (touchesTickets) {
          yield* Effect.gen(function* () {
            for (const next of nexts.filter(
              (next, index) => next !== originals[index]
            )) {
              yield* ticketDocs.write(orgSlug, slug, next.id, next)
              written.push({
                original: originals[nexts.indexOf(next)],
                next
              })
              yield* ticketIndex.upsertTicket(scope, next)
            }
          }).pipe(Effect.onError(() => revertWritten))
        }
        return nexts
      })
    )
    const sprintChange = yield* planSprint.pipe(
      Effect.onError(() => withTicketLocks(scope, ids, revertWritten))
    )

    return {
      tickets: nexts.map((next) => documentToTicket(next, view)),
      sprint: sprintChange
    }
  })

  const archive = Effect.fn("TicketCommands.archive")(function* (
    id: string,
    reason?: string
  ) {
    const scope = yield* ProjectScope
    const { orgSlug, slug } = scope
    return yield* withTicketDocumentLock(
      orgSlug,
      slug,
      id,
      Effect.gen(function* () {
        const current = yield* readTicket(scope, id)
        if (current.archivedAt !== null) {
          return yield* new Conflict({ reason: "ticket_already_archived" })
        }
        const trimmed = reason?.trim()
        const next = yield* ticketDocs.update(
          orgSlug,
          slug,
          id,
          (existing) =>
            DateTime.nowAsDate.pipe(
              Effect.map((now) => ({
                ...existing,
                archivedAt: existing.archivedAt ?? now,
                updatedAt: now
              }))
            ),
          (next) => ticketIndex.upsertTicket(scope, next),
          trimmed ? { archiveReason: trimmed } : {}
        )
        return yield* detailOf(next, yield* gitView)
      })
    )
  })

  const unarchive = Effect.fn("TicketCommands.unarchive")(function* (
    id: string
  ) {
    const scope = yield* ProjectScope
    const { orgSlug, slug } = scope
    return yield* withTicketDocumentLock(
      orgSlug,
      slug,
      id,
      Effect.gen(function* () {
        const current = yield* readTicket(scope, id)
        if (current.archivedAt === null) {
          return yield* new Conflict({ reason: "ticket_not_archived" })
        }
        const next = yield* ticketDocs.update(
          orgSlug,
          slug,
          id,
          (existing) =>
            DateTime.nowAsDate.pipe(
              Effect.map((updatedAt) => ({
                ...existing,
                archivedAt: null,
                updatedAt
              }))
            ),
          (next) => ticketIndex.upsertTicket(scope, next)
        )
        return yield* detailOf(next, yield* gitView)
      })
    )
  })

  return TicketCommands.of({
    bulkUpdate,
    quickCreate,
    create,
    update,
    clearStaleEstimates,
    split,
    moveInGroup,
    move,
    remove,
    archive,
    unarchive
  })
})

export const layer = Layer.effect(TicketCommands, make)
