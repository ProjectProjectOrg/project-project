import { GroupPolicy, TicketPolicy } from "@pp/access/policies"
import { Db } from "@pp/db"
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
  type ProjectScopeShape,
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
  type Forbidden
} from "@pp/shared"
import * as Context from "effect/Context"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"

import { ticketChanges } from "../activity/changes"
import { TicketActivity } from "../activity/TicketActivity"
import { Attachments } from "../attachments/Attachments"
import { validateBodyMentionsWithLookups } from "../comments/BodyMentions"
import type { InvalidCommentBody } from "../comments/Comments"
import { FigmaLinks } from "../figma/FigmaLinks"
import { Groups } from "../groups/Groups"
import { Library, type TemplateExpansion } from "../library/Library"
import type { MarkdownError } from "../markdown/Markdown"
import { ProjectDocs } from "../projects/ProjectDocs"
import { Projects } from "../projects/Projects"
import { readProjectDocument } from "../projects/readProjectDocument"
import {
  TicketDocs,
  ticketFileContent,
  type TicketDocument
} from "./TicketDocs"
import * as TicketDocumentLock from "./ticketDocumentLock"
import {
  validateHierarchy,
  type HierarchyLookups,
  type HierarchyNode
} from "./ticketHierarchy"
import { TicketIndex, type TicketIndexProject } from "./TicketIndex"
import {
  applyTicketPatch,
  hierarchyChangeOf,
  requestedChangeOf,
  ticketChangeOf
} from "./ticketPatch"
import {
  documentToTicket,
  indexProjectOf,
  requirePolicy,
  type TicketReadError
} from "./ticketPresentation"
import * as TicketView from "./TicketView"

const makeTicketId = Schema.decodeUnknownSync(TicketId)
const DEFAULT_STATUS = Schema.decodeSync(TicketStatus)("todo")

const requireTicketChange = (change: TicketPolicy.Change) =>
  requirePolicy((scope) => TicketPolicy.canChange(scope, change))

const requireSplit = (
  source: TicketDocument,
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
      Forbidden | NotFound | Validation | MentionInvalid | MarkdownError,
      ProjectScope
    >
    create: (
      input: CreateTicketInput
    ) => Effect.Effect<
      TicketDetail,
      Forbidden | NotFound | Validation | MentionInvalid | MarkdownError,
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
      | MarkdownError,
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
    remove: (
      id: string,
      options?: DeleteTicketQuery
    ) => Effect.Effect<
      void,
      NotFound | MarkdownError,
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
      | InvalidCommentBody,
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
  const ticketDocs = yield* TicketDocs
  const ticketActivity = yield* TicketActivity
  const { withTicketDocumentLock } =
    yield* TicketDocumentLock.TicketDocumentLock
  const projects = yield* Projects
  const projectDocs = yield* ProjectDocs
  const ticketIndex = yield* TicketIndex
  const groups = yield* Groups
  const db = yield* Db
  const attachments = yield* Attachments
  const figmaLinks = yield* FigmaLinks
  const library = yield* Library

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
    scope: ProjectScopeShape,
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
    indexProject: TicketIndexProject
  ): Effect.Effect<void, NotFound | MentionInvalid, ProjectScope> =>
    validateBodyMentionsWithLookups(body, {
      existingTicketIds: (ticketIds) =>
        ticketIndex.existingIds(indexProject, ticketIds),
      memberIds: () => projects.memberIds()
    })

  const validateAssigneesAreMembers = (
    assignees: ReadonlyArray<string>
  ): Effect.Effect<void, Validation, ProjectScope> =>
    Effect.gen(function* () {
      const members = yield* projects.memberIds()
      const invalid = assignees.filter((id) => !members.has(id))
      if (invalid.length > 0) {
        return yield* new Validation({
          reason: `non_member_assignees:${invalid.join(",")}`
        })
      }
    })

  const hierarchyLookups = (
    indexProject: TicketIndexProject,
    viewerId: string
  ): HierarchyLookups => {
    const found = new Map<TicketId, HierarchyNode | undefined>()
    return {
      find: (id) =>
        found.has(id)
          ? Effect.succeed(found.get(id))
          : ticketIndex.list(indexProject, [id]).pipe(
              Effect.map(([entry]) => entry),
              Effect.tap((entry) => Effect.sync(() => found.set(id, entry)))
            ),
      hasChildren: (id) => hasChildren(indexProject, viewerId, id)
    }
  }

  const validateNewParent = (
    indexProject: TicketIndexProject,
    viewerId: string,
    type: TicketType,
    parent: TicketId | undefined
  ): Effect.Effect<void, Validation> =>
    validateHierarchy(hierarchyLookups(indexProject, viewerId), {
      id: null,
      fromType: null,
      type,
      parent,
      parentChanged: parent !== undefined
    })

  const childIds = (
    indexProject: TicketIndexProject,
    viewerId: string,
    id: string
  ): Effect.Effect<ReadonlyArray<string>> =>
    Effect.forEach(
      [false, true],
      (archived) =>
        Effect.gen(function* () {
          const filter = { parent: [makeTicketId(id)], archived }
          const { total } = yield* ticketIndex.count(indexProject, filter, {
            viewerId
          })
          if (total === 0) return []
          const entries = yield* ticketIndex.query(
            indexProject,
            { ...filter, sort: DEFAULT_TICKET_SORT },
            { viewerId, limit: total }
          )
          return entries.map(({ entry }) => entry.id)
        }),
      { concurrency: 2 }
    ).pipe(Effect.map((pages) => pages.flat()))

  const hasChildren = (
    indexProject: TicketIndexProject,
    viewerId: string,
    id: string
  ): Effect.Effect<boolean> =>
    Effect.forEach(
      [false, true],
      (archived) =>
        ticketIndex.count(
          indexProject,
          { parent: [makeTicketId(id)], archived },
          { viewerId }
        ),
      { concurrency: 2 }
    ).pipe(Effect.map((counts) => counts.some(({ total }) => total > 0)))

  const writeWithIdAllocation = (
    orgSlug: string,
    slug: string,
    projectKey: ProjectKey,
    indexProject: TicketIndexProject,
    buildDocument: (id: TicketId) => TicketDocument,
    onFileWritten?: (document: TicketDocument) => void
  ): Effect.Effect<TicketDocument, MarkdownError> =>
    Effect.gen(function* () {
      while (true) {
        const candidate = makeTicketId(
          `${projectKey}-${yield* ticketIndex.reserveTicketNumber(indexProject)}`
        )
        const document = buildDocument(candidate)
        const result = yield* ticketDocs
          .create(orgSlug, slug, document, (created) =>
            Effect.sync(() => onFileWritten?.(created)).pipe(
              Effect.andThen(
                attachments.reconcileTicket(
                  orgSlug,
                  slug,
                  created.id,
                  created.body
                )
              ),
              Effect.andThen(
                figmaLinks.reconcileTicket(
                  orgSlug,
                  slug,
                  created.id,
                  created.title,
                  created.body
                )
              ),
              Effect.andThen(ticketIndex.upsertTicket(indexProject, created))
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
    orgSlug: string,
    slug: string,
    template: TemplateKey | null | undefined
  ): Effect.Effect<
    TemplateExpansion | null,
    NotFound | Validation | MarkdownError
  > =>
    template === undefined || template === null
      ? Effect.succeed(null)
      : library.expandForCreate(orgSlug, slug, template)

  const quickCreate = Effect.fn("TicketCommands.quickCreate")(function* (
    input: QuickCreateTicketInput
  ) {
    const scope = yield* ProjectScope
    const { orgSlug, slug, userId: ownerId, projectId } = scope
    yield* requireTicketChange({
      content: false,
      status: input.status !== undefined && input.status !== DEFAULT_STATUS,
      assignees: false
    })
    if (input.status !== undefined) {
      yield* validateStatusExists(projectId, input.status)
    }
    const expansion = yield* expansionFor(orgSlug, slug, input.template)
    const tags = expansion?.tags ?? []
    const body = expansion?.body ?? ""
    yield* validateTagsExist(projectId, tags)
    const indexProject = indexProjectOf(scope)
    if (body !== "") {
      yield* validateBody(body, indexProject)
    }
    const type = input.type ?? expansion?.type ?? "other"
    yield* validateNewParent(indexProject, ownerId, type, input.parent)
    const projectKey = yield* projects.key()
    const now = yield* DateTime.nowAsDate
    const document = yield* writeWithIdAllocation(
      orgSlug,
      slug,
      projectKey,
      indexProject,
      (id) => ({
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
      })
    )
    return yield* detailOf(document, yield* gitView)
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
    if (input.status !== undefined) {
      yield* validateStatusExists(projectId, input.status)
    }
    const expansion = yield* expansionFor(orgSlug, slug, input.template)
    const indexProject = indexProjectOf(scope)
    const projectKey = yield* projects.key()
    const tags = input.tags ?? expansion?.tags ?? []
    yield* validateTagsExist(projectId, tags)
    if (input.assignees !== undefined && input.assignees.length > 0) {
      yield* validateAssigneesAreMembers(input.assignees)
    }
    yield* validateEstimate(scope, input.estimate)
    const body = yield* library.resolveSynced(
      orgSlug,
      slug,
      normalizeLineEndings(input.body ?? expansion?.body ?? "")
    )
    if (body !== "") {
      yield* validateBody(body, indexProject)
    }
    const type = input.type ?? expansion?.type ?? "other"
    yield* validateNewParent(indexProject, ownerId, type, input.parent)
    const now = yield* DateTime.nowAsDate
    const document = yield* writeWithIdAllocation(
      orgSlug,
      slug,
      projectKey,
      indexProject,
      (id) => ({
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
      })
    )
    return yield* detailOf(document, yield* gitView)
  })

  const update = Effect.fn("TicketCommands.update")(function* (
    id: string,
    input: UpdateTicketInput,
    sort?: TicketSort,
    expected?: TicketUpdateExpectation
  ) {
    const scope = yield* ProjectScope
    const { orgSlug, slug, userId, projectId } = scope
    yield* validateEstimate(scope, input.estimate)
    if (sort?.key === "estimate")
      yield* readProjectDocument({ db, docs: projectDocs, project: scope })
    return yield* withTicketDocumentLock(
      orgSlug,
      slug,
      id,
      Effect.gen(function* () {
        const view = yield* gitView
        const indexProject = indexProjectOf(scope)

        if (input.status !== undefined) {
          yield* validateStatusExists(projectId, input.status)
        }
        if (input.tags !== undefined) {
          yield* validateTagsExist(projectId, input.tags)
        }

        const body =
          input.body === undefined
            ? undefined
            : yield* library.resolveSynced(
                orgSlug,
                slug,
                normalizeLineEndings(input.body)
              )

        if (body !== undefined) {
          yield* validateBody(body, indexProject)
        }

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
                hierarchyLookups(indexProject, userId),
                hierarchyChangeOf(existing, next)
              )
              if (
                next.type === "epic" &&
                existing.type !== "epic" &&
                (yield* groups.list()).some(
                  (group) =>
                    group.kind === "sprint" &&
                    group.completedAt === null &&
                    group.tickets.includes(existing.id)
                )
              ) {
                return yield* new Validation({ reason: "epic_in_sprint" })
              }
              return { ...next, updatedAt: yield* DateTime.nowAsDate }
            }),
          (next) =>
            (input.body === undefined
              ? Effect.void
              : attachments
                  .reconcileTicket(orgSlug, slug, id, next.body)
                  .pipe(
                    Effect.andThen(
                      figmaLinks.reconcileTicket(
                        orgSlug,
                        slug,
                        id,
                        next.title,
                        next.body
                      )
                    )
                  )
            ).pipe(Effect.andThen(ticketIndex.upsertTicket(indexProject, next)))
        )

        const ticket = yield* withMissingAttachments(
          orgSlug,
          yield* detailOf(next, view)
        )
        const orderKey =
          sort === undefined
            ? null
            : yield* ticketIndex.orderKeyFor(indexProject, id, sort)
        return { ticket, orderKey }
      })
    )
  })

  const clearStaleEstimates = Effect.fn("TicketCommands.clearStaleEstimates")(
    function* () {
      const scope = yield* ProjectScope
      const project = indexProjectOf(scope)
      yield* requireTicketChange({ content: true })
      const { estimation } = yield* readProjectDocument({
        db,
        docs: projectDocs,
        project: scope
      })
      const batches = yield* Effect.forEach([false, true], (archived) =>
        Effect.gen(function* () {
          const query = { estimate: ["stale" as const], archived }
          const { total } = yield* ticketIndex.count(project, query, {
            viewerId: scope.userId
          })
          if (total === 0) return []
          return yield* ticketIndex.query(
            project,
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
                (next) => ticketIndex.upsertTicket(project, next)
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
    const indexProject = indexProjectOf(scope)
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
            (next) => ticketIndex.upsertTicket(indexProject, next)
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
    orgSlug: string,
    slug: string,
    indexProject: TicketIndexProject,
    id: string,
    original: TicketDocument
  ) =>
    ticketDocs
      .write(orgSlug, slug, id, original)
      .pipe(Effect.andThen(ticketIndex.upsertTicket(indexProject, original)))

  const discardSplitResult = (
    orgSlug: string,
    slug: string,
    indexProject: TicketIndexProject,
    document: TicketDocument
  ) =>
    ticketDocs
      .remove(
        orgSlug,
        slug,
        document.id,
        attachments
          .reconcileTicket(orgSlug, slug, document.id, "")
          .pipe(
            Effect.andThen(
              figmaLinks.reconcileTicket(orgSlug, slug, document.id, "", "")
            ),
            Effect.andThen(ticketIndex.deleteTicket(indexProject, document.id))
          )
      )
      .pipe(Effect.ignore)

  const restoreSplitDocuments = (
    orgSlug: string,
    slug: string,
    id: string,
    indexProject: TicketIndexProject,
    original: TicketDocument,
    created: ReadonlyArray<TicketDocument>
  ) =>
    Effect.forEach(
      created,
      (document) => discardSplitResult(orgSlug, slug, indexProject, document),
      { discard: true }
    ).pipe(
      Effect.andThen(restoreTicket(orgSlug, slug, indexProject, id, original))
    )

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

    const indexProject = indexProjectOf(scope)
    const projectKey = yield* projects.key()
    const view = yield* gitView
    const source = yield* readTicket(orgSlug, slug, id)
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
        yield* validateHierarchy(hierarchyLookups(indexProject, userId), {
          id: original.id,
          fromType: original.type,
          type: retainedInput.type,
          parent: original.parent,
          parentChanged: false
        })
        const now = yield* DateTime.nowAsDate
        const persisted: Array<TicketDocument> = []

        const run = Effect.gen(function* () {
          const createdDocuments: Array<TicketDocument> = []
          for (const result of newInputs) {
            createdDocuments.push(
              yield* writeWithIdAllocation(
                orgSlug,
                slug,
                projectKey,
                indexProject,
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
            (next) => ticketIndex.upsertTicket(indexProject, next),
            { silent: true }
          )

          return { original, retained, createdDocuments }
        })

        return yield* run.pipe(
          Effect.onError(() =>
            restoreSplitDocuments(
              orgSlug,
              slug,
              id,
              indexProject,
              original,
              persisted
            ).pipe(Effect.ignoreCause)
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
              orgSlug,
              slug,
              id,
              indexProject,
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
          content: ticketFileContent(written.retained)
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

    return {
      retained: yield* detailOf(written.retained, view),
      created: yield* Effect.forEach(written.createdDocuments, (document) =>
        detailOf(document, view)
      )
    }
  })

  const remove = Effect.fn("TicketCommands.remove")(function* (
    id: string,
    options?: DeleteTicketQuery
  ): Effect.fn.Return<
    void,
    NotFound | MarkdownError,
    ProjectScope | ActivityActor
  > {
    const scope = yield* ProjectScope
    const { orgSlug, slug, userId } = scope
    const indexProject = indexProjectOf(scope)
    yield* groups.removeTicketFromAllGroups(orgSlug, slug, id)
    yield* withTicketDocumentLock(
      orgSlug,
      slug,
      id,
      ticketDocs.remove(
        orgSlug,
        slug,
        id,
        attachments
          .reconcileTicket(orgSlug, slug, id, "")
          .pipe(
            Effect.andThen(
              figmaLinks.reconcileTicket(orgSlug, slug, id, "", "")
            ),
            Effect.andThen(ticketIndex.deleteTicket(indexProject, id))
          )
      )
    )
    const children = yield* childIds(indexProject, userId, id)
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
      yield* releaseChildren(orgSlug, slug, userId, indexProject, id, children)
    }
  })

  const releaseChildren = (
    orgSlug: string,
    slug: string,
    userId: string,
    indexProject: TicketIndexProject,
    parentId: string,
    children: ReadonlyArray<string>
  ) =>
    Effect.gen(function* () {
      const now = yield* DateTime.nowAsDate
      yield* Effect.forEach(
        children,
        (childId) =>
          withTicketDocumentLock(
            orgSlug,
            slug,
            childId,
            ticketDocs.update(
              orgSlug,
              slug,
              childId,
              (existing) =>
                Effect.succeed({
                  ...existing,
                  parent: undefined,
                  updatedBy: userId,
                  updatedAt: now
                }),
              (next) => ticketIndex.upsertTicket(indexProject, next)
            )
          ).pipe(
            Effect.catchCause((cause) =>
              Effect.logError("remove: releasing child ticket failed", {
                orgSlug,
                slug,
                parentId,
                childId,
                cause
              })
            )
          ),
        { discard: true }
      )
    })

  const withTicketLocks = <A, E, R>(
    orgSlug: string,
    slug: string,
    ids: ReadonlyArray<string>,
    effect: Effect.Effect<A, E, R>
  ): Effect.Effect<A, E, R> =>
    ids
      .toSorted()
      .reduceRight(
        (inner, id) => withTicketDocumentLock(orgSlug, slug, id, inner),
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
    if (touchesTickets) {
      yield* requireTicketChange(requestedChangeOf(fields))
    }
    const indexProject = indexProjectOf(scope)
    if (fields.status !== undefined) {
      yield* validateStatusExists(projectId, fields.status)
    }
    if (fields.tags !== undefined) {
      yield* validateTagsExist(projectId, fields.tags)
    }
    if (fields.assignees !== undefined && fields.assignees.length > 0) {
      yield* validateAssigneesAreMembers(fields.assignees)
    }
    yield* validateEstimate(scope, fields.estimate)
    if (sprint !== undefined && sprint !== null) {
      yield* groups.ensureSprintAssignable([sprint])
    }
    const openSprints = (yield* groups.list()).filter(
      (group) => group.kind === "sprint" && group.completedAt === null
    )
    const view = yield* gitView

    const written: Array<TicketDocument> = []
    const restoreWritten = (originals: ReadonlyArray<TicketDocument>) =>
      Effect.forEach(
        originals.filter((original) =>
          written.some((next) => next.id === original.id)
        ),
        (original) =>
          restoreTicket(orgSlug, slug, indexProject, original.id, original),
        { discard: true }
      ).pipe(Effect.ignore)
    const { originals, nexts } = yield* withTicketLocks(
      orgSlug,
      slug,
      ids,
      Effect.gen(function* () {
        const originals = yield* Effect.forEach(ids, (id) =>
          ticketDocs.read(orgSlug, slug, id)
        )
        const now = yield* DateTime.nowAsDate
        const lookups = hierarchyLookups(indexProject, userId)
        const nexts: Array<TicketDocument> = []
        for (const existing of originals) {
          const patched = applyTicketPatch(existing, fields, userId, now)
          yield* validateHierarchy(
            lookups,
            hierarchyChangeOf(existing, patched)
          )
          const plannedInSprint =
            sprint === undefined
              ? openSprints.some((group) => group.tickets.includes(existing.id))
              : sprint !== null
          if (patched.type === "epic" && plannedInSprint) {
            return yield* new Validation({ reason: "epic_in_sprint" })
          }
          nexts.push(touchesTickets ? patched : existing)
        }

        if (touchesTickets) {
          yield* Effect.gen(function* () {
            for (const next of nexts) {
              yield* ticketDocs.write(orgSlug, slug, next.id, next)
              written.push(next)
              yield* ticketIndex.upsertTicket(indexProject, next)
            }
          }).pipe(Effect.onError(() => restoreWritten(originals)))
        }
        return { originals, nexts }
      })
    )

    const sprintChange = yield* Effect.gen(function* () {
      if (sprint === undefined) return null
      if (sprint !== null) return yield* groups.addTickets(sprint, ids)
      for (const group of openSprints) {
        const leaving = group.tickets.filter((id) => ids.includes(id))
        if (leaving.length === 0) continue
        yield* groups.removeTickets(group.id, leaving)
      }
      return null
    }).pipe(
      Effect.onError(() =>
        withTicketLocks(orgSlug, slug, ids, restoreWritten(originals))
      )
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
        const current = yield* readTicket(orgSlug, slug, id)
        if (current.archivedAt !== null) {
          return yield* new Conflict({ reason: "ticket_already_archived" })
        }
        const indexProject = indexProjectOf(scope)
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
          (next) => ticketIndex.upsertTicket(indexProject, next),
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
        const current = yield* readTicket(orgSlug, slug, id)
        if (current.archivedAt === null) {
          return yield* new Conflict({ reason: "ticket_not_archived" })
        }
        const indexProject = indexProjectOf(scope)
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
          (next) => ticketIndex.upsertTicket(indexProject, next)
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
    remove,
    archive,
    unarchive
  })
})

export const layer = Layer.effect(TicketCommands, make)
