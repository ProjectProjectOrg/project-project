import { it } from "@effect/vitest"
import {
  ActivityActor,
  BranchNotFound,
  Conflict,
  DEFAULT_TICKET_SORT,
  Group,
  matchesTicketQuery,
  NotFound,
  padNumericIdSort,
  paginateSorted,
  GroupColor,
  GroupDetail,
  GroupId,
  ProjectKey,
  RateLimited,
  SprintCompletedImmutable,
  TICKET_LIST_LIMIT,
  TicketId,
  TicketStatus,
  UserId,
  tryDecodeCursor,
  type TicketCountQuery,
  type TicketFilter,
  type TicketListQuery,
  type User,
  ProjectScope,
  type ProjectScopeShape,
  StatusSlug
} from "@pp/shared"
import * as DateTime from "effect/DateTime"
import * as Deferred from "effect/Deferred"
import * as Effect from "effect/Effect"
import * as Fiber from "effect/Fiber"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import { expect } from "vitest"

import { databaseLayer } from "../../test/database"
import { accessLayer, projectScope } from "../access/testing"
import { asUser, passthroughTicketActivity } from "../activity/testing"
import { Attachments, type AttachmentsShape } from "../attachments/Attachments"
import { Comments, type CommentsShape } from "../comments/Comments"
import { FigmaLinks, type FigmaLinksShape } from "../figma/FigmaLinks"
import { GitHub, type GitHubShape } from "../github/GitHub"
import { applyPullRequestWebhookToTicket } from "../github/GitHubTicketEventsLive"
import { Groups, type GroupsShape } from "../groups/Groups"
import { Library } from "../library/Library"
import { MarkdownError } from "../markdown/Markdown"
import { TicketIdTaken } from "../markdown/Markdown"
import { FinishedStatuses } from "../projects/FinishedStatuses"
import {
  DEFAULT_GIT_AUTOMATION_CONFIG,
  gitAutomationTestLayer,
  gitAutomationTestService
} from "../projects/gitAutomationTesting"
import { ProjectDocs } from "../projects/ProjectDocs"
import {
  Projects,
  type ProjectGithubIntegration,
  type ProjectsShape
} from "../projects/Projects"
import { Users, type UsersShape } from "../users/Users"
import type { GitAutomationConfig } from "./gitAutomation"
import {
  TicketDocs,
  type TicketDocsShape,
  type TicketDocument
} from "./TicketDocs"
import * as TicketDocumentLock from "./ticketDocumentLock"
import {
  TicketIndex,
  type TicketIndexProject,
  type TicketIndexQueryEntry,
  type TicketIndexShape
} from "./TicketIndex"
import { TICKET_ORDER_KEY_SEPARATOR } from "./TicketIndexLive"
import { Tickets } from "./Tickets"
import { TicketsLive } from "./TicketsLive"

const decodeGroupSync = Schema.decodeSync(Group)

const decodeGroupDetailSync = Schema.decodeSync(GroupDetail)

const isoDate = (s: string) => DateTime.toDate(DateTime.makeUnsafe(s))
const ticketId = Schema.decodeUnknownSync(TicketId)
const ticketStatus = Schema.decodeUnknownSync(TicketStatus)
const groupId = Schema.decodeUnknownSync(GroupId)
const groupColor = Schema.decodeUnknownSync(GroupColor)
const projectKey = Schema.decodeUnknownSync(ProjectKey)
const userId = Schema.decodeUnknownSync(UserId)
const githubIntegration = {
  projectIntegrationLinkId: "link-1",
  organizationId: "org-1",
  projectId: "project-1",
  projectSlug: "p",
  installationId: "123",
  repoId: "repo-1",
  repoOwner: "acme",
  repoName: "app",
  defaultBaseBranch: "main"
} satisfies ProjectGithubIntegration
const ticketIndexProject = {
  orgSlug: "org",
  organizationId: "org-1",
  projectId: "project-1",
  projectSlug: "p"
} satisfies TicketIndexProject

function unexpected(method: string): Effect.Effect<never> {
  return Effect.die(new Error(`unexpected ${method} call`))
}

function makeTicketDocument(
  id: string,
  overrides: Partial<TicketDocument> = {}
): TicketDocument {
  const now = isoDate("2026-04-01T00:00:00.000Z")
  return {
    id: ticketId(id),
    title: id,
    status: ticketStatus("todo"),
    type: "other",
    priority: "med",
    tags: [],
    branch: null,
    pr: null,
    prState: null,
    lastTransitionedPr: null,
    assignees: [],
    archivedAt: null,
    createdBy: "user-1",
    createdAt: now,
    updatedBy: "user-1",
    updatedAt: now,
    body: "",
    commentsRegion: "",
    ...overrides
  }
}

function makeFakeTicketDocs(initialIds: ReadonlyArray<string>) {
  const documents = new Map<string, TicketDocument>(
    initialIds.map((id) => [id, makeTicketDocument(id)])
  )

  const service: TicketDocsShape = {
    listIds: () =>
      Effect.succeed([...documents.keys()].map((id) => ticketId(id))),
    read: (_org: string, _slug: string, id: string) => {
      const document = documents.get(id)
      return document ? Effect.succeed(document) : Effect.fail(new NotFound())
    },
    create: (
      _org: string,
      _slug: string,
      document: TicketDocument,
      onPersist
    ) => {
      if (documents.has(document.id)) return Effect.fail(new TicketIdTaken())
      documents.set(document.id, document)
      return onPersist ? onPersist(document) : Effect.void
    },
    write: (
      _org: string,
      _slug: string,
      id: string,
      document: TicketDocument
    ) => {
      documents.set(id, document)
      return Effect.void
    },
    update: (org: string, slug: string, id: string, transform, onPersist) =>
      service.read(org, slug, id).pipe(
        Effect.flatMap(transform),
        Effect.tap((document) =>
          Effect.sync(() => documents.set(id, document))
        ),
        Effect.tap((document) =>
          onPersist ? onPersist(document) : Effect.void
        )
      ),
    remove: (
      _org: string,
      _slug: string,
      id: string,
      onPersist = Effect.void
    ) => {
      documents.delete(id)
      return onPersist
    },
    readRaw: () => unexpected("TicketDocs.readRaw")
  }

  return {
    documents,
    service,
    layer: Layer.succeed(TicketDocs, service)
  }
}

function makeFakeProjects(key: string, overrides: Partial<ProjectsShape> = {}) {
  const service = {
    list: () => unexpected("Projects.list"),
    listPaged: () => unexpected("Projects.listPaged"),
    listMembersPaged: () => unexpected("Projects.listMembersPaged"),
    create: () => unexpected("Projects.create"),
    get: () => unexpected("Projects.get"),
    key: () => Effect.succeed(projectKey(key)),
    githubIntegration: () => Effect.succeed(null),
    githubBranches: () => unexpected("Projects.githubBranches"),
    githubRepos: () => unexpected("Projects.githubRepos"),
    memberIds: () => Effect.succeed(new Set(["user-1", "user-2"])),
    update: () => unexpected("Projects.update"),
    updateSetup: () => unexpected("Projects.updateSetup"),
    remove: () => unexpected("Projects.remove"),
    addMember: () => unexpected("Projects.addMember"),
    updateMember: () => unexpected("Projects.updateMember"),
    removeMember: () => unexpected("Projects.removeMember"),
    leave: () => unexpected("Projects.leave"),
    cancelPendingMember: () => unexpected("Projects.cancelPendingMember"),
    unassignUserFromActiveTickets: () =>
      unexpected("Projects.unassignUserFromActiveTickets"),
    unassignUserFromOrgTickets: () =>
      unexpected("Projects.unassignUserFromOrgTickets"),
    connectGithub: () => unexpected("Projects.connectGithub"),
    disconnectGithub: () => unexpected("Projects.disconnectGithub"),
    ...overrides
  } satisfies ProjectsShape

  return Layer.succeed(Projects, service)
}

const scopeIn = (orgSlug: string, slug: string) =>
  projectScope("member", "developer", {
    orgSlug,
    slug,
    projectId: slug,
    organizationId: orgSlug
  })

const defaultScope = scopeIn("org", "p")

const testInfra = (scope = defaultScope) =>
  Layer.mergeAll(
    Layer.mock(ProjectDocs, {
      read: (_org, slug) =>
        Effect.succeed({
          slug,
          name: slug,
          icon: "folder",
          color: "#3b82f6",
          createdAt: isoDate("2026-01-01T00:00:00Z"),
          github: null,
          estimation: "points",
          templateDefaults: {},
          body: "",
          setup: {
            workflowReviewedAt: null,
            invitePeopleDismissedAt: null,
            connectGithubDismissedAt: null
          }
        })
    }),
    TicketDocumentLock.layer,
    accessLayer({}),
    Layer.succeed(ProjectScope, scope),
    Layer.succeed(ActivityActor, ActivityActor.user(scope.userId))
  )

const FakeDb = databaseLayer(({ sql }) =>
  Effect.sync(() => {
    if (sql.includes('from "project_status"'))
      return [["todo"], ["in_progress"], ["done"]]
    if (sql.includes('from "project_index"')) return [["points"]]
    throw new Error(`Unexpected SQL: ${sql}`)
  })
)

const makeFakeGroups = (overrides: Partial<GroupsShape> = {}) =>
  Layer.succeed(Groups, {
    list: () => unexpected("Groups.list"),
    listPaged: () => unexpected("Groups.listPaged"),
    listSprintsPaged: () => unexpected("Groups.listSprintsPaged"),
    get: () => unexpected("Groups.get"),
    create: () => unexpected("Groups.create"),
    update: () => unexpected("Groups.update"),
    updateTickets: () => unexpected("Groups.updateTickets"),
    addTickets: () => unexpected("Groups.addTickets"),
    removeTickets: () => unexpected("Groups.removeTickets"),
    updateTicketOrder: () => unexpected("Groups.updateTicketOrder"),
    complete: () => unexpected("Groups.complete"),
    remove: () => unexpected("Groups.remove"),
    ensureSprintAssignable: () => Effect.void,
    setSprintMembership: () => Effect.void,
    removeTicketFromAllGroups: () => Effect.void,
    ...overrides
  } satisfies GroupsShape)

const FakeGroups = makeFakeGroups()

const makeFakeAttachments = (
  overrides: Partial<AttachmentsShape> = {}
): Layer.Layer<Attachments> =>
  Layer.succeed(Attachments, {
    prepare: () => unexpected("Attachments.prepare"),
    commit: () => unexpected("Attachments.commit"),
    storeBytes: () => unexpected("Attachments.storeBytes"),
    resolveForServing: () => unexpected("Attachments.resolveForServing"),
    reconcileTicket: () => Effect.void,
    orphanProject: () => unexpected("Attachments.orphanProject"),
    listForOrg: () => unexpected("Attachments.listForOrg"),
    summarizeForOrg: () => unexpected("Attachments.summarizeForOrg"),
    deleteForOrg: () => unexpected("Attachments.deleteForOrg"),
    missingIds: () => Effect.succeed([]),
    reapOnce: () => unexpected("Attachments.reapOnce"),
    dedupeOnce: () => unexpected("Attachments.dedupeOnce"),
    ...overrides
  } satisfies AttachmentsShape)

const makeFakeFigmaLinks = (
  overrides: Partial<FigmaLinksShape> = {}
): Layer.Layer<FigmaLinks> =>
  Layer.succeed(FigmaLinks, {
    reconcileTicket: () => Effect.void,
    listForTicket: () => unexpected("FigmaLinks.listForTicket"),
    resolveThumbnailUrl: () => unexpected("FigmaLinks.resolveThumbnailUrl"),
    ...overrides
  } satisfies FigmaLinksShape)

const makeRecordingFigmaLinks = () => {
  const calls: Array<{
    readonly orgSlug: string
    readonly slug: string
    readonly ticketId: string
    readonly title: string
    readonly body: string
  }> = []
  return {
    calls,
    layer: makeFakeFigmaLinks({
      reconcileTicket: (orgSlug, slug, ticketId, title, body) =>
        Effect.sync(() => {
          calls.push({ orgSlug, slug, ticketId, title, body })
        })
    })
  }
}

const makeRecordingAttachments = () => {
  const calls: Array<{
    readonly orgSlug: string
    readonly slug: string
    readonly ticketId: string
    readonly body: string
  }> = []
  return {
    calls,
    layer: makeFakeAttachments({
      reconcileTicket: (orgSlug, slug, ticketId, body) =>
        Effect.sync(() => {
          calls.push({ orgSlug, slug, ticketId, body })
        })
    })
  }
}

const fakeUser = (id: string): User => ({
  id: userId(id),
  email: `${id}@example.com`,
  name: id,
  username: null,
  image: null,
  createdAt: isoDate("2026-01-01T00:00:00.000Z"),
  activeOrgSlug: null,
  personalGithub: { connected: false },
  editorPreference: "github",
  personalEverhour: {
    connected: false,
    everhourUserId: null,
    name: null,
    email: null,
    lastVerifiedAt: null,
    lastCheckError: null
  }
})

const FakeUsers = Layer.succeed(Users, {
  findByEmail: () => unexpected("Users.findByEmail"),
  findManyByIds: () => unexpected("Users.findManyByIds"),
  fullByIds: (ids) => Effect.succeed(ids.map(fakeUser))
} satisfies UsersShape)

const FakeComments = Layer.succeed(Comments, {
  list: () => unexpected("Comments.list"),
  create: () => unexpected("Comments.create"),
  importHistorical: () => unexpected("Comments.importHistorical"),
  edit: () => unexpected("Comments.edit"),
  remove: () => unexpected("Comments.remove")
} satisfies CommentsShape)

const makeFakeGitHub = (overrides: Partial<GitHubShape> = {}) =>
  Layer.succeed(GitHub, {
    listInstallationRepos: () => unexpected("GitHub.listInstallationRepos"),
    verifyInstallationRepo: () => unexpected("GitHub.verifyInstallationRepo"),
    createBranchAsUser: () => unexpected("GitHub.createBranchAsUser"),
    openPullRequestAsUser: () => unexpected("GitHub.openPullRequestAsUser"),
    fetchInstallationProjectStates: () =>
      unexpected("GitHub.fetchInstallationProjectStates"),
    listInstallationBranches: () =>
      unexpected("GitHub.listInstallationBranches"),
    branchExistsInstallation: () =>
      unexpected("GitHub.branchExistsInstallation"),
    ...overrides
  } satisfies GitHubShape)

const entryFromDocument = (document: TicketDocument) => {
  const { body: _body, commentsRegion: _commentsRegion, ...entry } = document
  return {
    ...entry,
    estimate: entry.estimate ?? null,
    parent: entry.parent ?? null,
    subTicketCount: 0,
    subTicketDoneCount: 0,
    prDraft: entry.prDraft ?? false,
    prBase: entry.prBase ?? null,
    ignoredBranches: entry.ignoredBranches ?? [],
    branchDeletedAt: null,
    checks: null,
    checksHeadSha: null,
    checksUpdatedAt: null
  }
}

const priorityOrdinal = { high: 3, med: 2, low: 1 } as const

const ticketSortValue = (
  document: TicketDocument,
  query: TicketListQuery
): string => {
  switch (query.sort.key) {
    case "id":
      return padNumericIdSort(document.id) ?? document.id
    case "created":
      return document.createdAt.toISOString()
    case "updated":
      return document.updatedAt.toISOString()
    case "title":
      return document.title.toLowerCase()
    case "priority":
      return String(priorityOrdinal[document.priority]).padStart(2, "0")
  }
  throw new Error("unsupported ticket sort key")
}

const matchingDocuments = (
  documents: Map<string, TicketDocument>,
  query: TicketFilter & Pick<TicketListQuery, "q">,
  viewerId: string,
  ticketIds?: ReadonlyArray<string>,
  excludeTicketIds?: ReadonlyArray<string>
) => {
  const included = ticketIds === undefined ? null : new Set(ticketIds)
  const excluded = new Set(excludeTicketIds)
  return [...documents.values()].filter(
    (document) =>
      (included === null || included.has(document.id)) &&
      !excluded.has(document.id) &&
      matchesTicketQuery(
        { ...document, estimate: document.estimate ?? null },
        query,
        userId(viewerId),
        "points"
      )
  )
}

const decodeStatusSlug = Schema.decodeSync(StatusSlug)

const querySectionsVia =
  (
    index: Pick<TicketIndexShape, "query" | "count">
  ): TicketIndexShape["querySections"] =>
  (project, query, options) =>
    Effect.gen(function* () {
      const out = new Map<
        string,
        {
          counts: { total: number; byStatus: Readonly<Record<string, number>> }
          entries: ReadonlyArray<TicketIndexQueryEntry>
        }
      >()
      const countQuery = { ...query, status: undefined }
      if (options.sections === "status") {
        const counts = yield* index.count(project, countQuery, options)
        for (const [status, total] of Object.entries(counts.byStatus)) {
          const requested =
            query.status === undefined ||
            query.status.some((value) => value === status)
          const entries = requested
            ? yield* index.query(
                project,
                { ...query, status: [decodeStatusSlug(status)] },
                options
              )
            : []
          out.set(status, {
            counts: { total, byStatus: { [status]: total } },
            entries
          })
        }
        return out
      }
      if (options.sections === "parent") {
        for (const parent of query.parent ?? []) {
          const scopedQuery = { ...query, parent: [parent] }
          const counts = yield* index.count(
            project,
            { ...scopedQuery, status: undefined },
            options
          )
          const entries = yield* index.query(project, scopedQuery, options)
          out.set(parent, { counts, entries })
        }
        return out
      }
      const explicit = options.sections.flatMap(
        (section) => section.ticketIds ?? []
      )
      for (const section of options.sections) {
        const scoped =
          section.ticketIds === undefined
            ? { ...options, excludeTicketIds: explicit }
            : { ...options, ticketIds: section.ticketIds }
        const counts = yield* index.count(project, countQuery, scoped)
        const entries = yield* index.query(project, query, scoped)
        out.set(section.key, { counts, entries })
      }
      return out
    })

const makeFakeTicketIndex = (
  documents: Map<string, TicketDocument>,
  overrides: Partial<TicketIndexShape> = {}
) => {
  let nextTicketNumber =
    Math.max(
      0,
      ...[...documents.keys()].map((id) =>
        Number(id.slice(id.lastIndexOf("-") + 1))
      )
    ) + 1
  const index: TicketIndexShape = {
    projectsFor: () => Effect.succeed([]),
    assignedTo: () => Effect.succeed([]),
    touchedBy: () => Effect.succeed([]),
    countAssignedByStatus: () => Effect.succeed([]),
    assignedPerProject: () => Effect.succeed([]),
    projectFor: () => Effect.succeed(ticketIndexProject),
    list: (_project, ticketIds) =>
      Effect.sync(() => {
        const wanted = ticketIds === undefined ? null : new Set(ticketIds)
        return [...documents.values()]
          .filter((document) => wanted === null || wanted.has(document.id))
          .map(entryFromDocument)
      }),
    query: (_project, query, options) =>
      Effect.sync(() => {
        const sign = query.sort.dir === "asc" ? 1 : -1
        const sorted = matchingDocuments(
          documents,
          query,
          options.viewerId,
          options.ticketIds,
          options.excludeTicketIds
        ).toSorted((left, right) => {
          const leftValue = ticketSortValue(left, query)
          const rightValue = ticketSortValue(right, query)
          if (leftValue < rightValue) return -1 * sign
          if (leftValue > rightValue) return sign
          if (left.id < right.id) return -1 * sign
          if (left.id > right.id) return sign
          return 0
        })
        return paginateSorted(sorted, {
          cursor: tryDecodeCursor(query.cursor),
          limit: options.limit,
          sortKey: (document) => ticketSortValue(document, query),
          id: (document) => document.id,
          dir: query.sort.dir
        }).items.map((document) => {
          const sortValue = ticketSortValue(document, query)
          return {
            entry: entryFromDocument(document),
            sortValue,
            orderKey: `${sortValue}${TICKET_ORDER_KEY_SEPARATOR}${document.id}`
          }
        })
      }),
    orderKeyFor: (_project, ticketId, sort) =>
      Effect.sync(() => {
        const document = documents.get(ticketId)
        if (document === undefined) return null
        const sortValue = ticketSortValue(document, { sort })
        return `${sortValue}${TICKET_ORDER_KEY_SEPARATOR}${ticketId}`
      }),
    count: (_project, query: TicketCountQuery, options) =>
      Effect.sync(() => {
        const byStatus: Record<string, number> = {}
        const matching = matchingDocuments(
          documents,
          query,
          options.viewerId,
          options.ticketIds,
          options.excludeTicketIds
        )
        for (const document of matching) {
          byStatus[document.status] = (byStatus[document.status] ?? 0) + 1
        }
        return { total: matching.length, byStatus }
      }),
    listIds: () => Effect.sync(() => [...documents.keys()]),
    existingIds: (_project, ticketIds) =>
      Effect.sync(
        () => new Set(ticketIds.filter((ticketId) => documents.has(ticketId)))
      ),
    reserveTicketNumber: () => Effect.sync(() => nextTicketNumber++),
    tagUsageCounts: () =>
      Effect.sync(() => {
        const counts: Record<string, number> = {}
        for (const document of documents.values()) {
          for (const tag of document.tags) {
            counts[tag] = (counts[tag] ?? 0) + 1
          }
        }
        return counts
      }),
    findTicketIdsByTag: (_project, tag) =>
      Effect.sync(() =>
        [...documents.values()]
          .filter((document) => document.tags.some((t) => t === tag))
          .map((document) => document.id)
      ),
    findTicketIdsByStatus: (_project, status) =>
      Effect.sync(() =>
        [...documents.values()]
          .filter((document) => document.status === status)
          .map((document) => document.id)
      ),
    findTicketsByBranch: (projectId, branch) =>
      Effect.sync(() =>
        [...documents.values()].flatMap((document) =>
          document.branch === branch
            ? [
                {
                  ...ticketIndexProject,
                  projectId,
                  ticketId: document.id,
                  branch
                }
              ]
            : []
        )
      ),
    findStackLayers: (projectId, branch) =>
      Effect.sync(() =>
        [...documents.values()].flatMap((document) =>
          (document.stack ?? []).some((layer) => layer.branch === branch)
            ? [
                {
                  ...ticketIndexProject,
                  projectId,
                  ticketId: document.id,
                  branch
                }
              ]
            : []
        )
      ),
    stacksFor: () =>
      Effect.sync(
        () =>
          new Map(
            [...documents.values()].flatMap((document) =>
              document.stack && document.stack.length > 0
                ? [[document.id as string, document.stack] as const]
                : []
            )
          )
      ),
    findMergesAwaiting: () => Effect.succeed([]),
    isRepositoryBranchAttached: (_repoId, branch, stackedOnly) =>
      Effect.sync(() =>
        [...documents.values()].some(
          (document) =>
            (!stackedOnly && document.branch === branch) ||
            (document.stack ?? []).some((layer) => layer.branch === branch)
        )
      ),
    getBranchDeletedAt: () => Effect.succeed(null),
    upsertTicket: (_project, document) =>
      Effect.sync(() => {
        documents.set(document.id, document)
      }),
    markBranchStale: () => Effect.succeed([]),
    clearBranchStale: () => Effect.void,
    updateBranchChecks: () => Effect.succeed([]),
    deleteTicket: (_project, ticketId) =>
      Effect.sync(() => {
        documents.delete(ticketId)
      }),
    rebuildProject: (project) =>
      Effect.succeed({ project, indexed: documents.size, skipped: 0 }),
    rebuildAllProjects: () =>
      Effect.succeed({
        projects: [
          { project: ticketIndexProject, indexed: documents.size, skipped: 0 }
        ]
      }),
    reconcileProject: (project) =>
      Effect.succeed({
        project,
        drift: { missing: [], orphaned: [], stale: [] },
        rebuilt: false,
        indexed: documents.size,
        skipped: 0
      }),
    reconcileAllProjects: () =>
      Effect.succeed({
        projects: [
          {
            project: ticketIndexProject,
            drift: { missing: [], orphaned: [], stale: [] },
            rebuilt: false,
            indexed: documents.size,
            skipped: 0
          }
        ],
        reconciled: 0
      }),
    querySections: (project, query, options) =>
      querySectionsVia(index)(project, query, options),
    ...overrides
  }
  return Layer.succeed(TicketIndex, index)
}

const makeRecordingTicketIndex = (documents: Map<string, TicketDocument>) => {
  const calls: Array<
    | {
        readonly type: "upsert"
        readonly ticketId: string
      }
    | {
        readonly type: "clearTicket"
        readonly ticketId: string
      }
  > = []
  return {
    calls,
    layer: makeFakeTicketIndex(documents, {
      getBranchDeletedAt: () => Effect.succeed(null),
      upsertTicket: (_project, document) =>
        Effect.sync(() => {
          documents.set(document.id, document)
          calls.push({ type: "upsert", ticketId: document.id })
        }),
      deleteTicket: (_project, ticketId) =>
        Effect.sync(() => {
          documents.delete(ticketId)
          calls.push({ type: "clearTicket", ticketId })
        })
    })
  }
}

const PassthroughLibrary = Layer.mock(Library, {
  resolveSynced: (_orgSlug, _slug, body) => Effect.succeed(body)
})

type TicketsLayerOptions = Readonly<{
  projectDocs?: Layer.Layer<ProjectDocs>
  projects?: Layer.Layer<Projects>
  groups?: Layer.Layer<Groups>
  github?: Layer.Layer<GitHub>
  ticketIndex?: Layer.Layer<TicketIndex>
  attachments?: Layer.Layer<Attachments>
  figmaLinks?: Layer.Layer<FigmaLinks>
  scope?: ProjectScopeShape
  gitAutomation?: GitAutomationConfig
}>

function makeTicketsLayer(
  key: string,
  ticketDocsLayer: Layer.Layer<TicketDocs>,
  options: TicketsLayerOptions = {}
) {
  return TicketsLive.pipe(
    Layer.provide(gitAutomationTestLayer(options.gitAutomation)),
    Layer.provide(PassthroughLibrary),
    Layer.provide(passthroughTicketActivity),
    Layer.provide(ticketDocsLayer),
    Layer.provide(options.projectDocs ?? Layer.empty),
    Layer.provide(options.projects ?? makeFakeProjects(key)),
    Layer.provide(options.groups ?? FakeGroups),
    Layer.provide(FakeComments),
    Layer.provide(FakeUsers),
    Layer.provide(options.attachments ?? makeFakeAttachments()),
    Layer.provide(options.figmaLinks ?? makeFakeFigmaLinks()),
    Layer.provide(options.github ?? makeFakeGitHub()),
    Layer.provide(options.ticketIndex ?? makeFakeTicketIndex(new Map())),
    Layer.provide(FakeDb),
    Layer.provide(FinishedStatuses.baseline),
    Layer.provideMerge(testInfra(options.scope))
  )
}

function makeTicketsFixture(key: string, initialIds: ReadonlyArray<string>) {
  const docs = makeFakeTicketDocs(initialIds)
  return {
    documents: docs.documents,
    layer: makeTicketsLayer(key, docs.layer, {
      ticketIndex: makeFakeTicketIndex(docs.documents)
    })
  }
}

it.effect("listGitStates fetches only distinct ticket branches", () => {
  const docs = makeFakeTicketDocs(["T-1", "T-2", "T-3", "T-4"])
  docs.documents.set("T-1", makeTicketDocument("T-1", { branch: "feat/T-1" }))
  docs.documents.set("T-2", makeTicketDocument("T-2", { branch: "feat/T-1" }))
  docs.documents.set("T-3", makeTicketDocument("T-3", { branch: "bug/T-3" }))

  const fetchedBranches: string[][] = []
  const layer = TicketsLive.pipe(
    Layer.provide(gitAutomationTestLayer()),
    Layer.provide(PassthroughLibrary),
    Layer.provide(passthroughTicketActivity),
    Layer.provide(docs.layer),
    Layer.provide(
      makeFakeProjects("T", {
        githubIntegration: () => Effect.succeed(githubIntegration)
      })
    ),
    Layer.provide(FakeGroups),
    Layer.provide(FakeComments),
    Layer.provide(FakeUsers),
    Layer.provide(makeFakeAttachments()),
    Layer.provide(makeFakeFigmaLinks()),
    Layer.provide(
      makeFakeGitHub({
        fetchInstallationProjectStates: (
          _installationId,
          _owner,
          _name,
          branches
        ) => {
          fetchedBranches.push([...branches])
          return Effect.succeed({
            defaultBranch: "main",
            openPullRequestText: new Map(),
            fetchedAt: isoDate("2026-04-01T00:00:00Z"),
            mergedPrsByBranch: new Map(),
            existingBranches: new Set(["feat/T-1", "bug/T-3"]),
            prByBranch: new Map()
          })
        }
      })
    ),
    Layer.provide(makeFakeTicketIndex(docs.documents)),
    Layer.provide(FakeDb),
    Layer.provide(FinishedStatuses.baseline),
    Layer.provideMerge(testInfra())
  )

  return Effect.gen(function* () {
    const tickets = yield* Tickets
    const result = yield* tickets.listGitStates()

    expect(fetchedBranches).toEqual([["feat/T-1", "bug/T-3"]])
    expect(result.states["T-1"]).toEqual({
      tag: "branch_no_pr",
      name: "feat/T-1",
      baseBranch: "main"
    })
    expect(result.states["T-4"]).toEqual({
      tag: "no_branch",
      baseBranch: "main"
    })
  }).pipe(Effect.provide(layer))
})

it.effect(
  "listGitStates skips a stale git write when a ticket branch changes during the fetch",
  () => {
    const clearedBranches: string[] = []
    const docs = makeFakeTicketDocs(["T-1"])
    docs.documents.set(
      "T-1",
      makeTicketDocument("T-1", { branch: "feat/T-1-current" })
    )
    const indexedTicket = makeTicketDocument("T-1", {
      branch: "feat/T-1-old"
    })
    const layer = TicketsLive.pipe(
      Layer.provide(gitAutomationTestLayer()),
      Layer.provide(PassthroughLibrary),
      Layer.provide(passthroughTicketActivity),
      Layer.provide(docs.layer),
      Layer.provide(
        makeFakeProjects("T", {
          githubIntegration: () => Effect.succeed(githubIntegration)
        })
      ),
      Layer.provide(FakeGroups),
      Layer.provide(FakeComments),
      Layer.provide(FakeUsers),
      Layer.provide(makeFakeAttachments()),
      Layer.provide(makeFakeFigmaLinks()),
      Layer.provide(
        makeFakeGitHub({
          fetchInstallationProjectStates: () =>
            Effect.succeed({
              defaultBranch: "main",
              mergedPrsByBranch: new Map(),
              openPullRequestText: new Map(),
              fetchedAt: isoDate("2026-04-01T00:00:00Z"),
              existingBranches: new Set(["feat/T-1-old"]),
              prByBranch: new Map([
                [
                  "feat/T-1-old",
                  {
                    headRefName: "feat/T-1-old",
                    baseRefName: "main",
                    state: "merged",
                    draft: false,
                    number: 42,
                    url: "https://github.com/acme/app/pull/42",
                    title: "Old branch",
                    mergedAt: null,
                    checks: "passing"
                  }
                ]
              ])
            })
        })
      ),
      Layer.provide(
        makeFakeTicketIndex(docs.documents, {
          clearBranchStale: (_project, ids) =>
            Effect.sync(() => {
              clearedBranches.push(...ids)
            }),
          list: () =>
            Effect.succeed([
              {
                ...entryFromDocument(indexedTicket),
                branchDeletedAt: indexedTicket.updatedAt,
                checks: null,
                checksHeadSha: null,
                checksUpdatedAt: null
              }
            ])
        })
      ),
      Layer.provide(FakeDb),
      Layer.provide(FinishedStatuses.baseline),
      Layer.provideMerge(testInfra())
    )

    return Effect.gen(function* () {
      const tickets = yield* Tickets
      const result = yield* tickets.listGitStates()

      expect(docs.documents.get("T-1")).toMatchObject({
        branch: "feat/T-1-current",
        pr: null,
        prState: null,
        status: ticketStatus("todo")
      })
      expect(result.states["T-1"]).toEqual({
        tag: "branch_pending",
        name: "feat/T-1-current",
        baseBranch: "main"
      })
      expect(result.transitioned).toEqual([])
      expect(clearedBranches).toEqual([])
    }).pipe(Effect.provide(layer))
  }
)

it.effect(
  "listGitStates follows merge bases until they reach the default branch",
  () => {
    const docs = makeFakeTicketDocs(["T-1"])
    docs.documents.set(
      "T-1",
      makeTicketDocument("T-1", {
        branch: "feat/T-1",
        pr: 5,
        prState: "merged",
        prBase: "release"
      })
    )
    const merges = new Map(
      (
        [
          ["feat/T-1", "release", 5, "2026-05-01T09:00:00Z"],
          ["release", "staging", 6, "2026-05-01T10:00:00Z"],
          ["staging", "b3", 7, "2026-05-01T11:00:00Z"],
          ["b3", "b4", 8, "2026-05-01T12:00:00Z"],
          ["b4", "b5", 9, "2026-05-01T13:00:00Z"],
          ["b5", "b6", 10, "2026-05-01T14:00:00Z"],
          ["b6", "b7", 11, "2026-05-01T15:00:00Z"],
          ["b7", "main", 12, "2026-05-01T16:00:00Z"]
        ] satisfies ReadonlyArray<readonly [string, string, number, string]>
      ).map(([head, base, number, mergedAt]) => [
        head,
        {
          headRefName: head,
          baseRefName: base,
          state: "merged" as const,
          draft: false,
          number: number,
          url: `https://github.com/acme/app/pull/${number}`,
          title: head,
          mergedAt: DateTime.toDate(DateTime.makeUnsafe(mergedAt)),
          checks: "passing" as const
        }
      ])
    )
    const fetchedBranches: Array<ReadonlyArray<string>> = []
    const layer = makeTicketsLayer("T", docs.layer, {
      projects: makeFakeProjects("T", {
        githubIntegration: () => Effect.succeed(githubIntegration)
      }),
      ticketIndex: makeFakeTicketIndex(docs.documents),
      github: makeFakeGitHub({
        fetchInstallationProjectStates: (
          _installation,
          _owner,
          _name,
          branches
        ) => {
          fetchedBranches.push([...branches])
          return Effect.succeed({
            defaultBranch: "main",
            openPullRequestText: new Map(),
            fetchedAt: isoDate("2026-04-01T00:00:00Z"),
            mergedPrsByBranch: new Map(),
            existingBranches: new Set(branches),
            prByBranch: new Map(
              branches.flatMap((branch) => {
                const pr = merges.get(branch)
                return pr === undefined ? [] : [[branch, pr] as const]
              })
            )
          })
        }
      })
    })

    return Effect.gen(function* () {
      const tickets = yield* Tickets
      yield* tickets.listGitStates()

      expect(fetchedBranches).toEqual([
        ["feat/T-1", "release"],
        ["staging"],
        ["b3"],
        ["b4"],
        ["b5"],
        ["b6"],
        ["b7"]
      ])
      expect(docs.documents.get("T-1")).toMatchObject({
        pr: 5,
        prState: "merged",
        lastTransitionedPr: 5
      })
    }).pipe(Effect.provide(layer))
  }
)

it.effect(
  "listGitStates without reconcile reads GitHub and writes nothing",
  () => {
    const docs = makeFakeTicketDocs(["T-1", "T-2"])
    docs.documents.set(
      "T-2",
      makeTicketDocument("T-2", { branch: "feat/T-2-gone" })
    )
    const before = docs.documents.get("T-1")
    const beforeGone = docs.documents.get("T-2")
    const layer = makeTicketsLayer("T", docs.layer, {
      projects: makeFakeProjects("T", {
        githubIntegration: () => Effect.succeed(githubIntegration)
      }),
      ticketIndex: makeFakeTicketIndex(docs.documents),
      github: makeFakeGitHub({
        fetchInstallationProjectStates: () =>
          Effect.succeed({
            defaultBranch: "main",
            openPullRequestText: new Map(),
            mergedPrsByBranch: new Map(),
            fetchedAt: isoDate("2026-04-01T00:00:00Z"),
            existingBranches: new Set(["feat/T-1-external"]),
            prByBranch: new Map([
              [
                "feat/T-1-external",
                {
                  headRefName: "feat/T-1-external",
                  baseRefName: "main",
                  state: "open",
                  draft: false,
                  number: 42,
                  url: "https://github.com/acme/app/pull/42",
                  title: "External change",
                  mergedAt: null,
                  checks: "passing"
                }
              ]
            ])
          })
      })
    })
    return Effect.gen(function* () {
      const tickets = yield* Tickets
      const result = yield* tickets.listGitStates({ reconcile: false })
      expect(result.changedTicketIds).toEqual([])
      expect(result.transitioned).toEqual([])
      expect(result.states["T-1"]).toMatchObject({ tag: "no_branch" })
      expect(result.states["T-2"]).toMatchObject({ tag: "stale_branch" })
      expect(docs.documents.get("T-1")).toEqual(before)
      expect(docs.documents.get("T-2")).toEqual(beforeGone)
    }).pipe(Effect.provide(layer))
  }
)

it.effect("listGitStates links an external branch and its existing PR", () => {
  const docs = makeFakeTicketDocs(["T-1"])
  const queries: Array<string | undefined> = []
  const layer = makeTicketsLayer("T", docs.layer, {
    projects: makeFakeProjects("T", {
      githubIntegration: () => Effect.succeed(githubIntegration)
    }),
    ticketIndex: makeFakeTicketIndex(docs.documents),
    github: makeFakeGitHub({
      fetchInstallationProjectStates: (
        _installation,
        _owner,
        _repo,
        _branches,
        query
      ) => {
        queries.push(query)
        return Effect.succeed({
          defaultBranch: "main",
          openPullRequestText: new Map(),
          mergedPrsByBranch: new Map(),
          fetchedAt: isoDate("2026-04-01T00:00:00Z"),
          existingBranches: new Set(["feat/T-1-external"]),
          prByBranch: new Map([
            [
              "feat/T-1-external",
              {
                headRefName: "feat/T-1-external",
                baseRefName: "main",
                state: "open",
                draft: false,
                number: 42,
                url: "https://github.com/acme/app/pull/42",
                title: "External change",
                mergedAt: null,
                checks: "passing"
              }
            ]
          ])
        })
      }
    })
  })
  return Effect.gen(function* () {
    const tickets = yield* Tickets
    const result = yield* tickets.listGitStates()
    expect(queries).toEqual(["T-"])
    expect(result.changedTicketIds).toEqual(["T-1"])
    expect(docs.documents.get("T-1")).toMatchObject({
      branch: "feat/T-1-external",
      pr: 42,
      prState: "open"
    })
    expect(result.states["T-1"]).toMatchObject({ tag: "pr_open", number: 42 })
    yield* tickets.listGitStates()
    expect(queries).toEqual(["T-", "T-"])
  }).pipe(Effect.provide(layer))
})

it.effect(
  "listGitStates links a branch named only in its open PR's title and applies the PR rule",
  () => {
    const docs = makeFakeTicketDocs(["T-1"])
    const layer = makeTicketsLayer("T", docs.layer, {
      projects: makeFakeProjects("T", {
        githubIntegration: () => Effect.succeed(githubIntegration)
      }),
      ticketIndex: makeFakeTicketIndex(docs.documents),
      github: makeFakeGitHub({
        fetchInstallationProjectStates: () =>
          Effect.succeed({
            defaultBranch: "main",
            fetchedAt: isoDate("2026-04-01T00:00:00Z"),
            mergedPrsByBranch: new Map(),
            existingBranches: new Set(["fix-login"]),
            prByBranch: new Map([
              [
                "fix-login",
                {
                  headRefName: "fix-login",
                  baseRefName: "main",
                  state: "open",
                  draft: false,
                  number: 42,
                  url: "https://github.com/acme/app/pull/42",
                  title: "T-1: fix login",
                  mergedAt: null,
                  checks: "passing"
                }
              ]
            ]),
            openPullRequestText: new Map([
              ["fix-login", { title: "T-1: fix login", body: "" }]
            ])
          })
      }),
      gitAutomation: {
        ...DEFAULT_GIT_AUTOMATION_CONFIG,
        rules: {
          ...DEFAULT_GIT_AUTOMATION_CONFIG.rules,
          pr_opened: ticketStatus("in_progress")
        }
      }
    })
    return Effect.gen(function* () {
      const tickets = yield* Tickets
      const result = yield* tickets.listGitStates()
      expect(result.changedTicketIds).toEqual(["T-1"])
      expect(docs.documents.get("T-1")).toMatchObject({
        branch: "fix-login",
        pr: 42,
        prState: "open",
        status: "in_progress"
      })
    }).pipe(Effect.provide(layer))
  }
)

const mergedPullRequest = (baseRefName: string) => ({
  headRefName: "feat/T-1",
  baseRefName,
  state: "merged" as const,
  draft: false,
  number: 42,
  url: "https://github.com/acme/app/pull/42",
  title: "Merged",
  mergedAt: null,
  checks: "passing" as const
})

const mergedSnapshotLayer = (
  docs: ReturnType<typeof makeFakeTicketDocs>,
  baseRefName: string
) =>
  makeTicketsLayer("T", docs.layer, {
    projects: makeFakeProjects("T", {
      githubIntegration: () =>
        Effect.succeed({ ...githubIntegration, defaultBaseBranch: "release" })
    }),
    ticketIndex: makeFakeTicketIndex(docs.documents),
    github: makeFakeGitHub({
      fetchInstallationProjectStates: () =>
        Effect.succeed({
          defaultBranch: "main",
          openPullRequestText: new Map(),
          fetchedAt: isoDate("2026-04-01T00:00:00Z"),
          mergedPrsByBranch: new Map(),
          existingBranches: new Set(["feat/T-1"]),
          prByBranch: new Map([["feat/T-1", mergedPullRequest(baseRefName)]])
        })
    })
  })

it.effect(
  "listGitStates moves a merged ticket once and leaves a manual move back alone",
  () => {
    const docs = makeFakeTicketDocs(["T-1"])
    docs.documents.set("T-1", makeTicketDocument("T-1", { branch: "feat/T-1" }))
    return Effect.gen(function* () {
      const tickets = yield* Tickets
      const first = yield* tickets.listGitStates()
      expect(docs.documents.get("T-1")).toMatchObject({
        status: ticketStatus("done"),
        prState: "merged",
        lastTransitionedPr: 42
      })
      expect(first.transitioned).toEqual([
        {
          ticketId: "T-1",
          fromStatus: ticketStatus("todo"),
          toStatus: ticketStatus("done"),
          prNumber: 42
        }
      ])

      yield* tickets.update("T-1", { status: ticketStatus("in_progress") })
      const second = yield* tickets.listGitStates()
      expect(docs.documents.get("T-1")?.status).toBe(
        ticketStatus("in_progress")
      )
      expect(second.transitioned).toEqual([])
    }).pipe(Effect.provide(mergedSnapshotLayer(docs, "release")))
  }
)

it.effect(
  "listGitStates records a merge into another branch without moving the ticket",
  () => {
    const docs = makeFakeTicketDocs(["T-1"])
    docs.documents.set("T-1", makeTicketDocument("T-1", { branch: "feat/T-1" }))
    return Effect.gen(function* () {
      const tickets = yield* Tickets
      const result = yield* tickets.listGitStates()
      expect(docs.documents.get("T-1")).toMatchObject({
        status: ticketStatus("todo"),
        prState: "merged"
      })
      expect(result.transitioned).toEqual([])
    }).pipe(Effect.provide(mergedSnapshotLayer(docs, "feat/stack-base")))
  }
)

it.effect("attachBranch moves the ticket by the branch rule", () => {
  const docs = makeFakeTicketDocs(["T-1"])
  const layer = makeTicketsLayer("T", docs.layer, {
    projects: makeFakeProjects("T", {
      githubIntegration: () => Effect.succeed(githubIntegration)
    }),
    ticketIndex: makeFakeTicketIndex(docs.documents),
    github: makeFakeGitHub({
      branchExistsInstallation: () => Effect.succeed(true)
    }),
    gitAutomation: {
      ...DEFAULT_GIT_AUTOMATION_CONFIG,
      rules: {
        ...DEFAULT_GIT_AUTOMATION_CONFIG.rules,
        branch_linked: ticketStatus("in_progress")
      }
    }
  })
  return Effect.gen(function* () {
    const tickets = yield* Tickets
    yield* tickets.attachBranch("T-1", { name: "feat/T-1" })
    expect(docs.documents.get("T-1")).toMatchObject({
      branch: "feat/T-1",
      status: ticketStatus("in_progress")
    })
  }).pipe(Effect.provide(layer))
})

it.effect(
  "explicit unlink survives edits and refresh until manual attachment",
  () => {
    const docs = makeFakeTicketDocs(["T-1"])
    docs.documents.set("T-1", makeTicketDocument("T-1", { branch: "feat/T-1" }))
    const layer = makeTicketsLayer("T", docs.layer, {
      projects: makeFakeProjects("T", {
        githubIntegration: () => Effect.succeed(githubIntegration)
      }),
      ticketIndex: makeFakeTicketIndex(docs.documents),
      github: makeFakeGitHub({
        branchExistsInstallation: () => Effect.succeed(true),
        fetchInstallationProjectStates: () =>
          Effect.succeed({
            defaultBranch: "main",
            mergedPrsByBranch: new Map(),
            openPullRequestText: new Map(),
            fetchedAt: isoDate("2026-04-01T00:00:00Z"),
            existingBranches: new Set(["feat/T-1"]),
            prByBranch: new Map()
          })
      })
    })
    return Effect.gen(function* () {
      const tickets = yield* Tickets
      yield* tickets.clearBranch("T-1")
      yield* tickets.update("T-1", { title: "Renamed" })
      const result = yield* tickets.listGitStates()
      expect(docs.documents.get("T-1")).toMatchObject({
        branch: null,
        branchAutoLinkDisabled: true,
        ignoredBranches: ["feat/T-1"],
        title: "Renamed"
      })
      expect(result.states["T-1"]).toEqual({
        tag: "no_branch",
        baseBranch: "main"
      })
      yield* tickets.attachBranch("T-1", {
        name: "feat/T-1"
      })
      expect(docs.documents.get("T-1")).toMatchObject({
        branch: "feat/T-1",
        branchAutoLinkDisabled: false
      })
      expect(docs.documents.get("T-1")?.ignoredBranches ?? []).toEqual([])
    }).pipe(Effect.provide(layer))
  }
)

it.effect(
  "automatic linking does not overwrite a manual link made during discovery",
  () => {
    const docs = makeFakeTicketDocs(["T-1"])
    const layer = makeTicketsLayer("T", docs.layer, {
      projects: makeFakeProjects("T", {
        githubIntegration: () => Effect.succeed(githubIntegration)
      }),
      ticketIndex: makeFakeTicketIndex(docs.documents),
      github: makeFakeGitHub({
        fetchInstallationProjectStates: () =>
          Effect.sync(() => {
            docs.documents.set(
              "T-1",
              makeTicketDocument("T-1", { branch: "manual-branch" })
            )
            return {
              defaultBranch: "main",
              openPullRequestText: new Map(),
              fetchedAt: isoDate("2026-04-01T00:00:00Z"),
              mergedPrsByBranch: new Map(),
              existingBranches: new Set(["feat/T-1"]),
              prByBranch: new Map()
            }
          })
      })
    })
    return Effect.gen(function* () {
      const tickets = yield* Tickets
      const result = yield* tickets.listGitStates()
      expect(docs.documents.get("T-1")?.branch).toBe("manual-branch")
      expect(result.states["T-1"]).toEqual({
        tag: "branch_pending",
        name: "manual-branch",
        baseBranch: "main"
      })
    }).pipe(Effect.provide(layer))
  }
)

it.effect("reserved repository branches require manual attachment", () => {
  const docs = makeFakeTicketDocs(["T-1"])
  const layer = makeTicketsLayer("T", docs.layer, {
    projects: makeFakeProjects("T", {
      githubIntegration: () => Effect.succeed(githubIntegration)
    }),
    ticketIndex: makeFakeTicketIndex(docs.documents, {
      isRepositoryBranchAttached: (repoId, branch, stackedOnly) => {
        expect(repoId).toBe("repo-1")
        expect(branch).toBe("feat/T-1")
        return Effect.succeed(!stackedOnly)
      }
    }),
    github: makeFakeGitHub({
      fetchInstallationProjectStates: () =>
        Effect.succeed({
          defaultBranch: "main",
          mergedPrsByBranch: new Map(),
          openPullRequestText: new Map(),
          fetchedAt: isoDate("2026-04-01T00:00:00Z"),
          existingBranches: new Set(["feat/T-1"]),
          prByBranch: new Map()
        }),
      branchExistsInstallation: () => Effect.succeed(true)
    })
  })
  return Effect.gen(function* () {
    const tickets = yield* Tickets
    const result = yield* tickets.listGitStates()
    expect(result.states["T-1"].tag).toBe("no_branch")
    expect(result.changedTicketIds).toEqual([])
    expect(docs.documents.get("T-1")?.branch).toBeNull()
    yield* tickets.attachBranch("T-1", {
      name: "feat/T-1"
    })
    expect(docs.documents.get("T-1")?.branch).toBe("feat/T-1")
  }).pipe(Effect.provide(layer))
})

it.effect(
  "concurrent projects cannot automatically claim the same branch",
  () =>
    Effect.gen(function* () {
      const scansReady = yield* Deferred.make<void>()
      const checkStarted = yield* Deferred.make<void>()
      const releaseCheck = yield* Deferred.make<void>()
      const documents = new Map([
        ["a", makeTicketDocument("T-1")],
        ["b", makeTicketDocument("T-1")]
      ])
      let scans = 0
      let checks = 0
      const docs = makeFakeTicketDocs([])
      const layer = makeTicketsLayer(
        "T",
        Layer.succeed(TicketDocs, {
          ...docs.service,
          read: (_org, slug) => Effect.succeed(documents.get(slug)!),
          update: (_org, slug, _id, transform, onPersist) =>
            Effect.gen(function* () {
              const next = yield* transform(documents.get(slug)!)
              documents.set(slug, next)
              if (onPersist) yield* onPersist(next)
              return next
            }),
          write: (_org, slug, _id, document) =>
            Effect.sync(() => {
              documents.set(slug, document)
            })
        }),
        {
          projects: makeFakeProjects("T", {
            githubIntegration: () =>
              Effect.map(ProjectScope, ({ slug }) => ({
                ...githubIntegration,
                projectId: slug,
                projectSlug: slug
              }))
          }),
          ticketIndex: makeFakeTicketIndex(new Map(), {
            projectFor: (orgSlug, slug) =>
              Effect.succeed({
                orgSlug,
                organizationId: orgSlug,
                projectId: slug,
                projectSlug: slug
              }),
            list: (project) =>
              Effect.sync(() => [
                entryFromDocument(documents.get(project.projectSlug)!)
              ]),
            isRepositoryBranchAttached: () =>
              Effect.gen(function* () {
                checks += 1
                const attached = [...documents.values()].some(
                  (doc) => doc.branch === "feat/T-1"
                )
                yield* Deferred.succeed(checkStarted, undefined)
                yield* Deferred.await(releaseCheck)
                return attached
              }),
            upsertTicket: () => Effect.void
          }),
          github: makeFakeGitHub({
            fetchInstallationProjectStates: () =>
              Effect.gen(function* () {
                scans += 1
                if (scans === 2) yield* Deferred.succeed(scansReady, undefined)
                yield* Deferred.await(scansReady)
                return {
                  defaultBranch: "main",
                  openPullRequestText: new Map(),
                  fetchedAt: isoDate("2026-04-01T00:00:00Z"),
                  mergedPrsByBranch: new Map(),
                  existingBranches: new Set(["feat/T-1"]),
                  prByBranch: new Map()
                }
              })
          })
        }
      )
      yield* Effect.gen(function* () {
        const tickets = yield* Tickets
        const scans = yield* Effect.all(
          [
            tickets
              .listGitStates()
              .pipe(Effect.provideService(ProjectScope, scopeIn("org-a", "a"))),
            tickets
              .listGitStates()
              .pipe(Effect.provideService(ProjectScope, scopeIn("org-b", "b")))
          ],
          { concurrency: 2 }
        ).pipe(Effect.forkChild)
        yield* Deferred.await(checkStarted)
        yield* Effect.yieldNow
        expect(checks).toBe(1)
        yield* Deferred.succeed(releaseCheck, undefined)
        const results = yield* Fiber.join(scans)
        expect(checks).toBe(2)
        expect(
          [...documents.values()].filter((doc) => doc.branch === "feat/T-1")
        ).toHaveLength(1)
        expect(
          results.flatMap((result) => result.changedTicketIds ?? [])
        ).toEqual(["T-1"])
      }).pipe(Effect.provide(layer))
    })
)

it.effect("manual unlink waits for a webhook write and remains unlinked", () =>
  Effect.gen(function* () {
    const writeStarted = yield* Deferred.make<void>()
    const releaseWrite = yield* Deferred.make<void>()
    const docs = makeFakeTicketDocs(["T-1"])
    docs.documents.set("T-1", makeTicketDocument("T-1", { branch: "feat/T-1" }))
    const coordinatedDocs: TicketDocsShape = {
      ...docs.service,
      update: (org, slug, id, transform, onPersist) =>
        docs.service.update(
          org,
          slug,
          id,
          (document) =>
            Effect.gen(function* () {
              const next = yield* transform(document)
              if (next.pr === 42) {
                yield* Deferred.succeed(writeStarted, undefined)
                yield* Deferred.await(releaseWrite)
              }
              return next
            }),
          onPersist
        )
    }
    const indexLayer = makeFakeTicketIndex(docs.documents)
    const layer = makeTicketsLayer(
      "T",
      Layer.succeed(TicketDocs, coordinatedDocs),
      {
        projects: makeFakeProjects("T", {
          githubIntegration: () => Effect.succeed(githubIntegration)
        }),
        ticketIndex: indexLayer
      }
    )
    return yield* Effect.gen(function* () {
      const tickets = yield* Tickets
      const index = yield* TicketIndex
      const ticketDocumentLock = yield* TicketDocumentLock.TicketDocumentLock
      const webhook = yield* Effect.forkChild(
        applyPullRequestWebhookToTicket(
          {
            ticketDocs: coordinatedDocs,
            ticketIndex: index,
            ticketDocumentLock,
            gitAutomation: gitAutomationTestService()
          },
          {
            orgSlug: "org",
            projectSlug: "p",
            organizationId: "org-1",
            projectId: "project-1",
            ticketId: "T-1",
            branch: "feat/T-1"
          },
          {
            installationId: "123",
            repositoryId: "repo-1",
            branch: "feat/T-1",
            number: 42,
            title: "First",
            body: "",
            state: "open",
            draft: false,
            updatedAt: null,
            baseBranch: "main",
            defaultBranch: "main"
          },
          "delivery-1"
        )
      )
      yield* Deferred.await(writeStarted)
      const unlink = yield* Effect.forkChild(tickets.clearBranch("T-1"))
      yield* Effect.yieldNow
      yield* Deferred.succeed(releaseWrite, undefined)
      yield* Fiber.join(webhook)
      yield* Fiber.join(unlink)
      expect(docs.documents.get("T-1")).toMatchObject({
        branch: null,
        pr: null,
        prState: null,
        branchAutoLinkDisabled: true
      })
    }).pipe(Effect.provide(Layer.merge(layer, indexLayer)))
  }).pipe(Effect.scoped)
)

it.effect(
  "rate-limited refresh keeps the persisted branch and exposes retry time",
  () => {
    const docs = makeFakeTicketDocs(["T-1"])
    docs.documents.set("T-1", makeTicketDocument("T-1", { branch: "feat/T-1" }))
    const layer = makeTicketsLayer("T", docs.layer, {
      projects: makeFakeProjects("T", {
        githubIntegration: () => Effect.succeed(githubIntegration)
      }),
      ticketIndex: makeFakeTicketIndex(docs.documents),
      github: makeFakeGitHub({
        fetchInstallationProjectStates: () =>
          Effect.fail(new RateLimited({ resetAt: 1234 }))
      })
    })
    return Effect.gen(function* () {
      const tickets = yield* Tickets
      const result = yield* tickets.listGitStates()
      expect(result).toMatchObject({
        refreshStatus: "rate_limited",
        retryAt: 1234,
        changedTicketIds: [],
        transitioned: []
      })
      expect(result.states["T-1"]).toEqual({
        tag: "branch_pending",
        name: "feat/T-1",
        baseBranch: "main"
      })
    }).pipe(Effect.provide(layer))
  }
)

it.effect(
  "stale GitHub snapshots display known PRs without applying transitions or automatic links",
  () => {
    const docs = makeFakeTicketDocs(["T-1", "T-2"])
    docs.documents.set("T-1", makeTicketDocument("T-1", { branch: "feat/T-1" }))
    const layer = makeTicketsLayer("T", docs.layer, {
      projects: makeFakeProjects("T", {
        githubIntegration: () => Effect.succeed(githubIntegration)
      }),
      ticketIndex: makeFakeTicketIndex(docs.documents),
      github: makeFakeGitHub({
        fetchInstallationProjectStates: () =>
          Effect.succeed({
            defaultBranch: "main",
            openPullRequestText: new Map(),
            fetchedAt: isoDate("2026-04-01T00:00:00Z"),
            mergedPrsByBranch: new Map(),
            refreshStatus: "stale",
            existingBranches: new Set(["feat/T-1", "feat/T-2"]),
            prByBranch: new Map([
              [
                "feat/T-1",
                {
                  headRefName: "feat/T-1",
                  baseRefName: "main",
                  state: "merged",
                  draft: false,
                  number: 42,
                  url: "https://github.com/acme/app/pull/42",
                  title: "Merged",
                  mergedAt: null,
                  checks: "passing"
                }
              ]
            ])
          })
      })
    })
    return Effect.gen(function* () {
      const tickets = yield* Tickets
      const result = yield* tickets.listGitStates()
      expect(result).toMatchObject({
        refreshStatus: "stale",
        changedTicketIds: [],
        transitioned: []
      })
      expect(result.states["T-1"]).toMatchObject({
        tag: "pr_merged",
        number: 42
      })
      expect(docs.documents.get("T-1")).toMatchObject({
        status: ticketStatus("todo"),
        pr: null
      })
      expect(docs.documents.get("T-2")?.branch).toBeNull()
    }).pipe(Effect.provide(layer))
  }
)

it.effect(
  "an older cached GitHub snapshot cannot undo a newer persisted merge",
  () => {
    const docs = makeFakeTicketDocs(["T-1"])
    docs.documents.set(
      "T-1",
      makeTicketDocument("T-1", {
        branch: "feat/T-1",
        pr: 42,
        prState: "merged",
        lastTransitionedPr: 42,
        status: ticketStatus("done")
      })
    )
    const layer = makeTicketsLayer("T", docs.layer, {
      projects: makeFakeProjects("T", {
        githubIntegration: () => Effect.succeed(githubIntegration)
      }),
      ticketIndex: makeFakeTicketIndex(docs.documents),
      github: makeFakeGitHub({
        fetchInstallationProjectStates: () =>
          Effect.succeed({
            defaultBranch: "main",
            mergedPrsByBranch: new Map(),
            openPullRequestText: new Map(),
            fetchedAt: isoDate("2026-03-31T23:59:00Z"),
            existingBranches: new Set(["feat/T-1"]),
            prByBranch: new Map([
              [
                "feat/T-1",
                {
                  headRefName: "feat/T-1",
                  baseRefName: "main",
                  state: "open",
                  draft: false,
                  number: 42,
                  url: "https://github.com/acme/app/pull/42",
                  title: "Open",
                  mergedAt: null,
                  checks: "passing"
                }
              ]
            ])
          })
      })
    })
    return Effect.gen(function* () {
      const tickets = yield* Tickets
      const result = yield* tickets.listGitStates()
      expect(result.changedTicketIds).toEqual([])
      expect(result.states["T-1"]).toMatchObject({
        tag: "pr_merged",
        number: 42
      })
      expect(docs.documents.get("T-1")?.prState).toBe("merged")
    }).pipe(Effect.provide(layer))
  }
)

it.effect("createBranch writes markdown and upserts the ticket index", () => {
  const docs = makeFakeTicketDocs(["T-1"])
  docs.documents.set(
    "T-1",
    makeTicketDocument("T-1", { branchAutoLinkDisabled: true })
  )
  const index = makeRecordingTicketIndex(docs.documents)
  const createdBranches: Array<{
    readonly owner: string
    readonly repo: string
    readonly branch: string
    readonly base: string
    readonly userId: string
  }> = []
  const layer = makeTicketsLayer("T", docs.layer, {
    projects: makeFakeProjects("T", {
      githubIntegration: () => Effect.succeed(githubIntegration)
    }),
    github: makeFakeGitHub({
      createBranchAsUser: (owner, repo, branch, base, userId) =>
        Effect.sync(() => {
          createdBranches.push({ owner, repo, branch, base, userId })
          return { name: branch, sha: "sha-1" }
        })
    }),
    ticketIndex: index.layer
  })

  return Effect.gen(function* () {
    const tickets = yield* Tickets
    const updated = yield* tickets.createBranch("T-1", {
      name: "feat/T-1"
    })

    expect(updated.branch).toBe("feat/T-1")
    expect(docs.documents.get("T-1")?.branchAutoLinkDisabled).toBe(false)
    expect(docs.documents.get("T-1")?.branch).toBe("feat/T-1")
    expect(createdBranches).toEqual([
      {
        owner: "acme",
        repo: "app",
        branch: "feat/T-1",
        base: "main",
        userId: "user-1"
      }
    ])
    expect(index.calls).toEqual([
      {
        type: "upsert",
        ticketId: "T-1"
      }
    ])
  }).pipe(Effect.provide(layer))
})

it.effect(
  "remove reconciles with an empty body so the deleted ticket's attachments are orphaned",
  () => {
    const docs = makeFakeTicketDocs(["T-1"])
    const attachments = makeRecordingAttachments()
    const figmaLinks = makeRecordingFigmaLinks()
    const layer = makeTicketsLayer("T", docs.layer, {
      attachments: attachments.layer,
      figmaLinks: figmaLinks.layer,
      ticketIndex: makeFakeTicketIndex(docs.documents),
      scope: projectScope("member", "pm", {
        orgSlug: "org",
        slug: "p",
        projectId: "p",
        organizationId: "org"
      })
    })

    return Effect.gen(function* () {
      const tickets = yield* Tickets
      yield* tickets.remove("T-1")

      expect(attachments.calls).toEqual([
        { orgSlug: "org", slug: "p", ticketId: "T-1", body: "" }
      ])
      expect(figmaLinks.calls).toEqual([
        { orgSlug: "org", slug: "p", ticketId: "T-1", title: "", body: "" }
      ])
    }).pipe(Effect.provide(layer))
  }
)

it.effect(
  "create, quickCreate and update reconcile figma references with the saved body",
  () => {
    const docs = makeFakeTicketDocs([])
    const figmaLinks = makeRecordingFigmaLinks()
    const layer = makeTicketsLayer("T", docs.layer, {
      figmaLinks: figmaLinks.layer,
      ticketIndex: makeFakeTicketIndex(docs.documents)
    })

    return Effect.gen(function* () {
      const tickets = yield* Tickets
      const created = yield* tickets.create({
        title: "One",
        body: "# One\nhttps://www.figma.com/design/FILEKEY123/Spec\n"
      })
      const quick = yield* tickets.quickCreate({
        title: "Two"
      })
      yield* tickets.update(created.id, {
        body: "# One\nedited\n"
      })

      expect(figmaLinks.calls.map((call) => call.ticketId)).toEqual([
        created.id,
        quick.id,
        created.id
      ])
      expect(figmaLinks.calls[0].body).toContain("figma.com")
      expect(figmaLinks.calls[2].body).toContain("edited")
    }).pipe(Effect.provide(layer))
  }
)

it.effect("create propagates ticket index write failures", () => {
  const docs = makeFakeTicketDocs([])
  const layer = makeTicketsLayer("T", docs.layer, {
    ticketIndex: makeFakeTicketIndex(docs.documents, {
      getBranchDeletedAt: () => Effect.succeed(null),
      upsertTicket: () => Effect.die(new Error("index failed"))
    })
  })

  return Effect.gen(function* () {
    const tickets = yield* Tickets
    const exit = yield* tickets.create({ title: "Indexed" }).pipe(Effect.exit)

    expect(exit._tag).toBe("Failure")
  }).pipe(Effect.provide(layer))
})

it.effect(
  "clearBranch clears markdown and upserts the ticket index row",
  () => {
    const docs = makeFakeTicketDocs(["T-1"])
    docs.documents.set("T-1", makeTicketDocument("T-1", { branch: "feat/T-1" }))
    const index = makeRecordingTicketIndex(docs.documents)
    const layer = makeTicketsLayer("T", docs.layer, {
      projects: makeFakeProjects("T", {
        githubIntegration: () => Effect.succeed(githubIntegration)
      }),
      ticketIndex: index.layer
    })

    return Effect.gen(function* () {
      const tickets = yield* Tickets
      const updated = yield* tickets.clearBranch("T-1")

      expect(updated.branch).toBeNull()
      expect(docs.documents.get("T-1")?.branch).toBeNull()
      expect(index.calls).toEqual([
        {
          type: "upsert",
          ticketId: "T-1"
        }
      ])
    }).pipe(Effect.provide(layer))
  }
)

it.effect("get uses persisted prState for the fallback git state", () => {
  const docs = makeFakeTicketDocs(["T-1"])
  docs.documents.set(
    "T-1",
    makeTicketDocument("T-1", {
      branch: "feat/T-1",
      pr: 80,
      prState: "merged",
      status: ticketStatus("done")
    })
  )
  const layer = makeTicketsLayer("T", docs.layer, {
    projects: makeFakeProjects("T", {
      githubIntegration: () => Effect.succeed(githubIntegration)
    })
  })

  return Effect.gen(function* () {
    const tickets = yield* Tickets
    const ticket = yield* tickets.get("T-1")

    expect(ticket.gitState).toEqual({
      tag: "pr_merged",
      branch: "feat/T-1",
      baseBranch: "main",
      number: 80,
      url: "https://github.com/acme/app/pull/80",
      title: "",
      mergedAt: null
    })
  }).pipe(Effect.provide(layer))
})

it.effect("create allocates the next id from the project key", () => {
  const { documents, layer } = makeTicketsFixture("FOO", ["FOO-1", "FOO-3"])
  return Effect.gen(function* () {
    const tickets = yield* Tickets
    const created = yield* tickets.create({
      title: "Add project keys"
    })

    expect(created.id).toBe("FOO-4")
    expect(created.body).toBe("")
    expect(documents.has("FOO-4")).toBe(true)
  }).pipe(Effect.provide(layer))
})

it.effect("create keeps legacy T project ids readable and sequential", () => {
  const { documents, layer } = makeTicketsFixture("T", ["T-1", "T-35"])
  return Effect.gen(function* () {
    const tickets = yield* Tickets
    const created = yield* tickets.create({
      title: "Keep legacy ids"
    })

    expect(created.id).toBe("T-36")
    expect(documents.has("T-36")).toBe(true)
  }).pipe(Effect.provide(layer))
})

it.effect(
  "create advances past an unindexed file collision without scanning the ticket directory",
  () => {
    const docs = makeFakeTicketDocs(["FOO-2"])
    const indexed = new Map([["FOO-1", makeTicketDocument("FOO-1")]])
    const layer = makeTicketsLayer("FOO", docs.layer, {
      ticketIndex: makeFakeTicketIndex(indexed, {
        listIds: () => unexpected("TicketIndex.listIds")
      })
    })

    return Effect.gen(function* () {
      const tickets = yield* Tickets
      const created = yield* tickets.create({
        title: "Skip stale collision"
      })

      expect(created.id).toBe("FOO-3")
      expect(docs.documents.has("FOO-3")).toBe(true)
    }).pipe(Effect.provide(layer))
  }
)

const makeEpicFixture = () => {
  const docs = makeFakeTicketDocs(["T-1", "T-2"])
  docs.documents.set("T-1", makeTicketDocument("T-1", { type: "epic" }))
  const layer = makeTicketsLayer("T", docs.layer, {
    ticketIndex: makeFakeTicketIndex(docs.documents)
  })
  return { docs, layer }
}

it.effect("create files a sub-ticket under an epic", () => {
  const { docs, layer } = makeEpicFixture()
  return Effect.gen(function* () {
    const tickets = yield* Tickets
    const created = yield* tickets.quickCreate({
      title: "Estimate field",
      parent: ticketId("T-1")
    })

    expect(created.parent).toBe("T-1")
    expect(docs.documents.get(created.id)?.parent).toBe("T-1")
  }).pipe(Effect.provide(layer))
})

it.effect(
  "create rejects a sub-ticket as parent, and an epic with a parent",
  () => {
    const { docs, layer } = makeEpicFixture()
    docs.documents.set(
      "T-3",
      makeTicketDocument("T-3", { parent: ticketId("T-2") })
    )
    return Effect.gen(function* () {
      const tickets = yield* Tickets
      const underSubTicket = yield* tickets
        .create({
          title: "Child",
          parent: ticketId("T-3")
        })
        .pipe(Effect.flip)
      const nestedEpic = yield* tickets
        .create({
          title: "Nested",
          type: "epic",
          parent: ticketId("T-1")
        })
        .pipe(Effect.flip)

      expect(underSubTicket).toMatchObject({
        _tag: "Validation",
        reason: "invalid_parent:T-3"
      })
      expect(nestedEpic).toMatchObject({
        _tag: "Validation",
        reason: "epic_with_parent"
      })
    }).pipe(Effect.provide(layer))
  }
)

it.effect("deleting an epic takes its tickets out of it", () => {
  const { docs, layer } = makeEpicFixture()
  docs.documents.set(
    "T-2",
    makeTicketDocument("T-2", { parent: ticketId("T-1") })
  )
  return Effect.gen(function* () {
    const tickets = yield* Tickets
    yield* tickets.remove("T-1")

    expect(docs.documents.has("T-1")).toBe(false)
    expect(docs.documents.get("T-2")?.parent).toBeUndefined()
  }).pipe(Effect.provide(layer))
})

it.effect("an epic keeps its type while it has tickets", () => {
  const { layer } = makeEpicFixture()
  return Effect.gen(function* () {
    const tickets = yield* Tickets
    yield* tickets.update("T-2", {
      parent: ticketId("T-1")
    })
    const blocked = yield* tickets
      .update("T-1", { type: "feat" })
      .pipe(Effect.flip)
    yield* tickets.update("T-2", { parent: null })
    const freed = yield* tickets.update("T-1", {
      type: "feat"
    })

    expect(blocked).toMatchObject({
      _tag: "Validation",
      reason: "epic_has_tickets"
    })
    expect(freed.ticket.type).toBe("feat")
  }).pipe(Effect.provide(layer))
})

it.effect("a ticket holds sub-tickets one level deep", () => {
  const { docs, layer } = makeEpicFixture()
  return Effect.gen(function* () {
    const tickets = yield* Tickets
    const child = yield* tickets.quickCreate({
      title: "Child",
      parent: ticketId("T-2")
    })
    const grandchild = yield* tickets
      .quickCreate({ title: "Grandchild", parent: child.id })
      .pipe(Effect.flip)

    expect(docs.documents.get(child.id)?.parent).toBe("T-2")
    expect(grandchild).toMatchObject({
      _tag: "Validation",
      reason: `invalid_parent:${child.id}`
    })
  }).pipe(Effect.provide(layer))
})

it.effect(
  "a ticket with sub-tickets can move under an epic but not under a ticket or become an epic",
  () => {
    const { docs, layer } = makeEpicFixture()
    docs.documents.set("T-3", makeTicketDocument("T-3"))
    docs.documents.set(
      "T-4",
      makeTicketDocument("T-4", { parent: ticketId("T-2") })
    )
    return Effect.gen(function* () {
      const tickets = yield* Tickets
      const underTicket = yield* tickets
        .update("T-2", { parent: ticketId("T-3") })
        .pipe(Effect.flip)
      const toEpic = yield* tickets
        .update("T-2", { type: "epic" })
        .pipe(Effect.flip)
      const underEpic = yield* tickets.update("T-2", {
        parent: ticketId("T-1")
      })

      expect(underTicket).toMatchObject({
        _tag: "Validation",
        reason: "ticket_has_sub_tickets"
      })
      expect(toEpic).toMatchObject({
        _tag: "Validation",
        reason: "ticket_has_sub_tickets"
      })
      expect(underEpic.ticket.parent).toBe("T-1")
    }).pipe(Effect.provide(layer))
  }
)

it.effect("deleting with cascadeSubTickets deletes the whole subtree", () => {
  const { docs, layer } = makeEpicFixture()
  docs.documents.set(
    "T-2",
    makeTicketDocument("T-2", { parent: ticketId("T-1") })
  )
  docs.documents.set(
    "T-3",
    makeTicketDocument("T-3", { parent: ticketId("T-2") })
  )
  docs.documents.set("T-4", makeTicketDocument("T-4"))
  docs.documents.set(
    "T-5",
    makeTicketDocument("T-5", { parent: ticketId("T-4") })
  )
  return Effect.gen(function* () {
    const tickets = yield* Tickets
    yield* tickets.remove("T-1", { cascadeSubTickets: true })

    expect([...docs.documents.keys()]).toEqual(["T-4", "T-5"])
  }).pipe(Effect.provide(layer))
})

it.effect("a ticket in an open sprint can't become an epic", () => {
  const docs = makeFakeTicketDocs(["T-1"])
  const sprint = decodeGroupSync({
    id: "G-1",
    name: "Sprint",
    kind: "sprint",
    tickets: ["T-1"],
    color: "#123456",
    startsAt: null,
    endsAt: null,
    completedAt: null,
    createdBy: "user-1",
    createdAt: "2026-04-01T00:00:00.000Z",
    updatedAt: "2026-04-01T00:00:00.000Z"
  })
  const layer = makeTicketsLayer("T", docs.layer, {
    ticketIndex: makeFakeTicketIndex(docs.documents),
    groups: makeFakeGroups({ list: () => Effect.succeed([sprint]) })
  })
  return Effect.gen(function* () {
    const tickets = yield* Tickets
    const error = yield* tickets
      .update("T-1", { type: "epic" })
      .pipe(Effect.flip)

    expect(error).toMatchObject({
      _tag: "Validation",
      reason: "epic_in_sprint"
    })
  }).pipe(Effect.provide(layer))
})

it.effect("epicSections groups tickets under their epic, then No epic", () => {
  const docs = makeFakeTicketDocs([])
  const add = (id: string, overrides: Partial<TicketDocument>) =>
    docs.documents.set(id, makeTicketDocument(id, overrides))
  add("T-1", { type: "epic", title: "Estimation" })
  add("T-2", { title: "Estimate field", parent: ticketId("T-1") })
  add("T-3", { title: "Passkeys" })
  add("T-4", { type: "epic", title: "Access control" })
  const layer = makeTicketsLayer("T", docs.layer, {
    ticketIndex: makeFakeTicketIndex(docs.documents)
  })
  return Effect.gen(function* () {
    const tickets = yield* Tickets
    const result = yield* tickets.epicSections({
      sort: DEFAULT_TICKET_SORT
    })

    expect(
      result.sections.map((section) => ({
        key: section.key,
        title: section.title,
        ids: section.page.items.map((row) => row.ticket.id)
      }))
    ).toEqual([
      { key: "T-4", title: "Access control", ids: [] },
      { key: "T-1", title: "Estimation", ids: ["T-2"] },
      { key: "none", title: null, ids: ["T-3"] }
    ])
    expect(result.total).toBe(2)
  }).pipe(Effect.provide(layer))
})

const bulkSprint = decodeGroupSync({
  id: "G-1",
  name: "Sprint",
  kind: "sprint",
  tickets: [],
  color: "#123456",
  startsAt: null,
  endsAt: null,
  completedAt: null,
  createdBy: "user-1",
  createdAt: "2026-04-01T00:00:00.000Z",
  updatedAt: "2026-04-01T00:00:00.000Z"
})

const makeBulkFixture = (addTickets: GroupsShape["addTickets"]) => {
  const docs = makeFakeTicketDocs(["T-1", "T-2", "T-3"])
  docs.documents.set(
    "T-3",
    makeTicketDocument("T-3", { type: "epic", title: "Estimation" })
  )
  const layer = makeTicketsLayer("T", docs.layer, {
    ticketIndex: makeFakeTicketIndex(docs.documents),
    groups: makeFakeGroups({ list: () => Effect.succeed([]), addTickets })
  })
  return { docs, layer }
}

it.effect("bulkUpdate patches every ticket and plans them in one call", () => {
  const added: Array<ReadonlyArray<string>> = []
  const { docs, layer } = makeBulkFixture((_id, ids) =>
    Effect.sync(() => {
      added.push(ids)
      return {
        target: { ...bulkSprint, tickets: [...ids], body: "" },
        evicted: []
      }
    })
  )
  return Effect.gen(function* () {
    const tickets = yield* Tickets
    const result = yield* tickets.bulkUpdate({
      tickets: [ticketId("T-1"), ticketId("T-2")],
      patch: {
        priority: "high",
        parent: ticketId("T-3"),
        sprint: bulkSprint.id
      }
    })

    expect(result.tickets.map((ticket) => ticket.priority)).toEqual([
      "high",
      "high"
    ])
    expect(docs.documents.get("T-2")?.parent).toBe("T-3")
    expect(added).toEqual([["T-1", "T-2"]])
  }).pipe(Effect.provide(layer))
})

it.effect("bulkUpdate writes nothing when one ticket breaks a rule", () => {
  const { docs, layer } = makeBulkFixture(() => unexpected("Groups.addTickets"))
  return Effect.gen(function* () {
    const tickets = yield* Tickets
    const error = yield* tickets
      .bulkUpdate({
        tickets: [ticketId("T-1"), ticketId("T-3")],
        patch: { priority: "high", sprint: bulkSprint.id }
      })
      .pipe(Effect.flip)

    expect(error).toMatchObject({
      _tag: "Validation",
      reason: "epic_in_sprint"
    })
    expect(docs.documents.get("T-1")?.priority).toBe("med")
  }).pipe(Effect.provide(layer))
})

it.effect("bulkUpdate restores the tickets when planning fails", () => {
  const { docs, layer } = makeBulkFixture(() =>
    Effect.fail(new SprintCompletedImmutable())
  )
  return Effect.gen(function* () {
    const tickets = yield* Tickets
    const error = yield* tickets
      .bulkUpdate({
        tickets: [ticketId("T-1"), ticketId("T-2")],
        patch: { priority: "high", sprint: bulkSprint.id }
      })
      .pipe(Effect.flip)

    expect(error._tag).toBe("SprintCompletedImmutable")
    expect(docs.documents.get("T-1")?.priority).toBe("med")
    expect(docs.documents.get("T-2")?.priority).toBe("med")
  }).pipe(Effect.provide(layer))
})

it.effect("ticket mention validation trusts the ticket index", () => {
  const docs = makeFakeTicketDocs(["T-1"])
  const layer = makeTicketsLayer("T", docs.layer, {
    ticketIndex: makeFakeTicketIndex(new Map())
  })

  return Effect.gen(function* () {
    const tickets = yield* Tickets
    const error = yield* tickets
      .create({
        title: "Reference a ticket",
        body: "See [T-1](mention:ticket/T-1)."
      })
      .pipe(Effect.flip)

    expect(error).toMatchObject({
      _tag: "MentionInvalid",
      kind: "unknown_ticket"
    })
  }).pipe(Effect.provide(layer))
})

it.effect("list reads ticket index rows", () => {
  const docs = makeFakeTicketDocs(["T-1"])

  return Effect.gen(function* () {
    const tickets = yield* Tickets
    const result = yield* tickets.list({
      sort: DEFAULT_TICKET_SORT
    })

    expect(result.items.map((row) => row.ticket.id)).toEqual(["T-1"])
    expect(result.nextCursor).toBeNull()
  }).pipe(
    Effect.provide(
      makeTicketsLayer("T", docs.layer, {
        ticketIndex: makeFakeTicketIndex(docs.documents)
      })
    )
  )
})

it.effect(
  "list resolves the ungrouped filter without treating it as a group id",
  () => {
    const docs = makeFakeTicketDocs(["T-1", "T-2"])
    const activeSprint = decodeGroupSync({
      id: "G-1",
      name: "Sprint",
      kind: "sprint",
      tickets: ["T-1"],
      color: "#123456",
      startsAt: null,
      endsAt: null,
      completedAt: null,
      createdBy: "user-1",
      createdAt: "2026-04-01T00:00:00.000Z",
      updatedAt: "2026-04-01T00:00:00.000Z"
    })
    const epic = decodeGroupSync({
      id: "G-2",
      name: "Epic",
      kind: "epic",
      tickets: ["T-2"],
      color: "#654321",
      startsAt: null,
      endsAt: null,
      completedAt: null,
      createdBy: "user-1",
      createdAt: "2026-04-01T00:00:00.000Z",
      updatedAt: "2026-04-01T00:00:00.000Z"
    })
    const groups = makeFakeGroups({
      list: () => Effect.succeed([activeSprint, epic])
    })

    return Effect.gen(function* () {
      const tickets = yield* Tickets
      const result = yield* tickets.list({
        sort: DEFAULT_TICKET_SORT,
        groupId: ["ungrouped"]
      })

      expect(result.items.map((row) => row.ticket.id)).toEqual(["T-2"])
    }).pipe(
      Effect.provide(
        makeTicketsLayer("T", docs.layer, {
          groups,
          ticketIndex: makeFakeTicketIndex(docs.documents)
        })
      )
    )
  }
)

it.effect("list ungrouped filter excludes tickets in a planned sprint", () => {
  const docs = makeFakeTicketDocs(["T-1", "T-2"])
  const plannedSprint = decodeGroupSync({
    id: "G-1",
    name: "Planned",
    kind: "sprint",
    tickets: ["T-1"],
    color: "#123456",
    startsAt: "2099-01-01T00:00:00.000Z",
    endsAt: "2099-01-15T00:00:00.000Z",
    completedAt: null,
    createdBy: "user-1",
    createdAt: "2026-04-01T00:00:00.000Z",
    updatedAt: "2026-04-01T00:00:00.000Z"
  })
  const groups = makeFakeGroups({
    list: () => Effect.succeed([plannedSprint])
  })

  return Effect.gen(function* () {
    const tickets = yield* Tickets
    const result = yield* tickets.list({
      sort: DEFAULT_TICKET_SORT,
      groupId: ["ungrouped"]
    })

    expect(result.items.map((row) => row.ticket.id)).toEqual(["T-2"])
  }).pipe(
    Effect.provide(
      makeTicketsLayer("T", docs.layer, {
        groups,
        ticketIndex: makeFakeTicketIndex(docs.documents)
      })
    )
  )
})

it.effect("list defaults to created desc", () => {
  const { documents, layer } = makeTicketsFixture("T", [])
  documents.set(
    "T-1",
    makeTicketDocument("T-1", {
      title: "old",
      createdAt: isoDate("2026-01-01T00:00:00.000Z")
    })
  )
  documents.set(
    "T-2",
    makeTicketDocument("T-2", {
      title: "mid",
      createdAt: isoDate("2026-02-01T00:00:00.000Z")
    })
  )
  documents.set(
    "T-3",
    makeTicketDocument("T-3", {
      title: "new",
      createdAt: isoDate("2026-03-01T00:00:00.000Z")
    })
  )

  return Effect.gen(function* () {
    const tickets = yield* Tickets
    const result = yield* tickets.list({
      sort: DEFAULT_TICKET_SORT
    })

    expect(result.items.map((row) => row.ticket.title)).toEqual([
      "new",
      "mid",
      "old"
    ])
    expect(result.nextCursor).toBeNull()
  }).pipe(Effect.provide(layer))
})

it.effect("list sorts by title asc", () => {
  const { documents, layer } = makeTicketsFixture("T", [])
  documents.set("T-1", makeTicketDocument("T-1", { title: "C" }))
  documents.set("T-2", makeTicketDocument("T-2", { title: "A" }))
  documents.set("T-3", makeTicketDocument("T-3", { title: "B" }))

  return Effect.gen(function* () {
    const tickets = yield* Tickets
    const query: TicketListQuery = {
      sort: { key: "title", dir: "asc" }
    }
    const result = yield* tickets.list(query)

    expect(result.items.map((row) => row.ticket.title)).toEqual(["A", "B", "C"])
  }).pipe(Effect.provide(layer))
})

it.effect("list paginates by cursor", () => {
  const { layer } = makeTicketsFixture("T", [])
  const total = TICKET_LIST_LIMIT + 5
  return Effect.gen(function* () {
    const tickets = yield* Tickets
    for (let i = 0; i < total; i++) {
      yield* tickets.create({ title: `t-${i}` })
    }

    const sortById: TicketListQuery = {
      sort: { key: "id", dir: "asc" }
    }
    const page1 = yield* tickets.list(sortById)
    expect(page1.items.length).toBe(TICKET_LIST_LIMIT)
    expect(page1.nextCursor).not.toBeNull()

    const page2 = yield* tickets.list({
      ...sortById,
      cursor: page1.nextCursor ?? undefined
    })
    expect(page2.items.length).toBe(5)
    expect(page2.nextCursor).toBeNull()

    const page1Ids = new Set(page1.items.map((row) => row.ticket.id))
    for (const row of page2.items) {
      expect(page1Ids.has(row.ticket.id)).toBe(false)
    }
  }).pipe(Effect.provide(layer))
})

it.effect("list paginates by cursor with default created desc sort", () => {
  const { documents, layer } = makeTicketsFixture("T", [])
  const total = TICKET_LIST_LIMIT + 5
  const base = DateTime.makeUnsafe("2026-01-01T00:00:00.000Z")
  for (let i = 0; i < total; i++) {
    const id = `T-${i + 1}`
    documents.set(
      id,
      makeTicketDocument(id, {
        title: id,
        createdAt: DateTime.toDate(DateTime.addDuration(`${i} hours`)(base))
      })
    )
  }

  return Effect.gen(function* () {
    const tickets = yield* Tickets
    const page1 = yield* tickets.list({
      sort: DEFAULT_TICKET_SORT
    })
    expect(page1.items.length).toBe(TICKET_LIST_LIMIT)
    expect(page1.nextCursor).not.toBeNull()
    const page1Times = page1.items.map((row) => row.ticket.createdAt.getTime())
    for (let i = 1; i < page1Times.length; i++) {
      expect(page1Times[i - 1]).toBeGreaterThan(page1Times[i])
    }

    const page2 = yield* tickets.list({
      sort: DEFAULT_TICKET_SORT,
      cursor: page1.nextCursor ?? undefined
    })
    expect(page2.items.length).toBe(5)
    expect(page2.nextCursor).toBeNull()
    const page2Times = page2.items.map((row) => row.ticket.createdAt.getTime())
    for (let i = 1; i < page2Times.length; i++) {
      expect(page2Times[i - 1]).toBeGreaterThan(page2Times[i])
    }

    const seen = new Set(page1.items.map((row) => row.ticket.id))
    for (const row of page2.items) {
      expect(seen.has(row.ticket.id)).toBe(false)
    }
  }).pipe(Effect.provide(layer))
})

it.effect("list honors an explicit limit override", () => {
  const { layer } = makeTicketsFixture("T", [])
  return Effect.gen(function* () {
    const tickets = yield* Tickets
    for (let i = 0; i < 10; i++) {
      yield* tickets.create({ title: `t-${i}` })
    }

    const page = yield* tickets.list({ sort: { key: "id", dir: "asc" } }, 3)
    expect(page.items.length).toBe(3)
    expect(page.nextCursor).not.toBeNull()
  }).pipe(Effect.provide(layer))
})

it.effect("list filters by q and substitutes mine to viewerId", () => {
  const { layer } = makeTicketsFixture("T", [])
  return Effect.gen(function* () {
    const tickets = yield* Tickets
    yield* tickets.create({
      title: "hello world",
      assignees: ["user-1"]
    })
    yield* tickets.create({
      title: "goodbye world",
      assignees: ["user-2"]
    })

    const byQ = yield* tickets.list({
      sort: DEFAULT_TICKET_SORT,
      q: "hello"
    })
    expect(byQ.items.map((row) => row.ticket.title)).toEqual(["hello world"])

    const mine = yield* tickets.list({
      sort: DEFAULT_TICKET_SORT,
      assignee: ["mine"]
    })
    expect(mine.items.map((row) => row.ticket.title)).toEqual(["hello world"])
  }).pipe(Effect.provide(layer))
})

it.effect("count returns zeros for every status on empty project", () => {
  const { layer } = makeTicketsFixture("T", [])
  return Effect.gen(function* () {
    const tickets = yield* Tickets
    const result = yield* tickets.count({})
    expect(result).toEqual({
      total: 0,
      byStatus: {}
    })
  }).pipe(Effect.provide(layer))
})

it.effect("count aggregates byStatus across a mixed-status project", () => {
  const { documents, layer } = makeTicketsFixture("T", [])
  documents.set(
    "T-1",
    makeTicketDocument("T-1", { status: ticketStatus("todo") })
  )
  documents.set(
    "T-2",
    makeTicketDocument("T-2", { status: ticketStatus("todo") })
  )
  documents.set(
    "T-3",
    makeTicketDocument("T-3", { status: ticketStatus("todo") })
  )
  documents.set(
    "T-4",
    makeTicketDocument("T-4", { status: ticketStatus("in_progress") })
  )
  documents.set(
    "T-5",
    makeTicketDocument("T-5", { status: ticketStatus("in_progress") })
  )
  documents.set(
    "T-6",
    makeTicketDocument("T-6", { status: ticketStatus("done") })
  )

  return Effect.gen(function* () {
    const tickets = yield* Tickets
    const result = yield* tickets.count({})
    expect(result).toEqual({
      total: 6,
      byStatus: { todo: 3, in_progress: 2, done: 1 }
    })
  }).pipe(Effect.provide(layer))
})

it.effect(
  "count strips status from filter so chip counts stay meaningful",
  () => {
    const { documents, layer } = makeTicketsFixture("T", [])
    documents.set(
      "T-1",
      makeTicketDocument("T-1", { status: ticketStatus("todo") })
    )
    documents.set(
      "T-2",
      makeTicketDocument("T-2", { status: ticketStatus("todo") })
    )
    documents.set(
      "T-3",
      makeTicketDocument("T-3", { status: ticketStatus("todo") })
    )
    documents.set(
      "T-4",
      makeTicketDocument("T-4", { status: ticketStatus("in_progress") })
    )
    documents.set(
      "T-5",
      makeTicketDocument("T-5", { status: ticketStatus("in_progress") })
    )
    documents.set(
      "T-6",
      makeTicketDocument("T-6", { status: ticketStatus("done") })
    )

    return Effect.gen(function* () {
      const tickets = yield* Tickets
      const result = yield* tickets.count({
        status: [ticketStatus("done")]
      })
      expect(result).toEqual({
        total: 6,
        byStatus: { todo: 3, in_progress: 2, done: 1 }
      })
    }).pipe(Effect.provide(layer))
  }
)

it.effect("count still applies non-status filters", () => {
  const { documents, layer } = makeTicketsFixture("T", [])
  documents.set(
    "T-1",
    makeTicketDocument("T-1", { status: ticketStatus("todo"), type: "feat" })
  )
  documents.set(
    "T-2",
    makeTicketDocument("T-2", {
      status: ticketStatus("in_progress"),
      type: "feat"
    })
  )
  documents.set(
    "T-3",
    makeTicketDocument("T-3", { status: ticketStatus("done"), type: "feat" })
  )
  documents.set(
    "T-4",
    makeTicketDocument("T-4", { status: ticketStatus("todo"), type: "bug" })
  )
  documents.set(
    "T-5",
    makeTicketDocument("T-5", {
      status: ticketStatus("in_progress"),
      type: "bug"
    })
  )

  return Effect.gen(function* () {
    const tickets = yield* Tickets
    const result = yield* tickets.count({
      type: ["bug"]
    })
    expect(result).toEqual({
      total: 2,
      byStatus: { todo: 1, in_progress: 1 }
    })
  }).pipe(Effect.provide(layer))
})

it.effect("count substitutes mine to viewerId like list", () => {
  const { documents, layer } = makeTicketsFixture("T", [])
  documents.set(
    "T-1",
    makeTicketDocument("T-1", {
      status: ticketStatus("todo"),
      assignees: ["user-1"]
    })
  )
  documents.set(
    "T-2",
    makeTicketDocument("T-2", {
      status: ticketStatus("in_progress"),
      assignees: ["user-1"]
    })
  )
  documents.set(
    "T-3",
    makeTicketDocument("T-3", {
      status: ticketStatus("done"),
      assignees: ["user-2"]
    })
  )

  return Effect.gen(function* () {
    const tickets = yield* Tickets
    const result = yield* tickets.count({
      assignee: ["mine"]
    })
    expect(result).toEqual({
      total: 2,
      byStatus: { todo: 1, in_progress: 1 }
    })
  }).pipe(Effect.provide(layer))
})

for (const scenario of [
  { branch: null, pr: null, tag: "no_branch", indexReads: 1 },
  { branch: "feat/T-1", pr: 80, tag: "pr_pending", indexReads: 1 },
  { branch: "feat/T-1", pr: null, tag: "stale_branch", indexReads: 1 }
] as const) {
  it.effect(
    `detail preserves git state with one index lookup for ${scenario.tag}`,
    () => {
      const docs = makeFakeTicketDocs(["T-1"])
      const document = makeTicketDocument("T-1", {
        branch: scenario.branch,
        pr: scenario.pr
      })
      docs.documents.set("T-1", document)
      let projectReads = 0
      let indexReads = 0
      const layer = makeTicketsLayer("T", docs.layer, {
        ticketIndex: makeFakeTicketIndex(docs.documents, {
          projectFor: () =>
            Effect.sync(() => {
              projectReads++
              return ticketIndexProject
            }),
          getBranchDeletedAt: () =>
            Effect.sync(() => {
              indexReads++
              return isoDate("2026-01-02T00:00:00.000Z")
            })
        })
      })
      return Effect.gen(function* () {
        const tickets = yield* Tickets
        const detail = yield* tickets.get("T-1")
        expect(detail.gitState.tag).toBe(scenario.tag)
        expect(projectReads).toBe(0)
        expect(indexReads).toBe(scenario.indexReads)
      }).pipe(Effect.provide(layer))
    }
  )
}

it.effect(
  "hands back the order key the list query gives the ticket it just wrote",
  () => {
    const docs = makeFakeTicketDocs(["T-1", "T-2", "T-3"])
    const layer = makeTicketsLayer("T", docs.layer, {
      ticketIndex: makeFakeTicketIndex(docs.documents)
    })
    return Effect.gen(function* () {
      const tickets = yield* Tickets
      const sort = { key: "title", dir: "asc" } as const
      const updated = yield* tickets.update("T-2", { title: "Zulu" }, sort)
      expect(updated.ticket.title).toBe("Zulu")

      const page = yield* tickets.list({ sort })
      const row = page.items.find((item) => item.ticket.id === "T-2")
      expect(updated.orderKey).toBe(row?.orderKey)
      expect(page.items.map((item) => item.ticket.id)).toEqual([
        "T-1",
        "T-3",
        "T-2"
      ])
    }).pipe(Effect.provide(layer))
  }
)

it.effect("omits the order key when no sort is asked for", () => {
  const docs = makeFakeTicketDocs(["T-1"])
  const layer = makeTicketsLayer("T", docs.layer, {
    ticketIndex: makeFakeTicketIndex(docs.documents)
  })
  return Effect.gen(function* () {
    const tickets = yield* Tickets
    const updated = yield* tickets.update("T-1", {
      title: "Quiet"
    })
    expect(updated.orderKey).toBeNull()
  }).pipe(Effect.provide(layer))
})

it.effect(
  "rejects a template body when the ticket changed after it was read",
  () => {
    const docs = makeFakeTicketDocs(["T-1"])
    const layer = makeTicketsLayer("T", docs.layer, {
      ticketIndex: makeFakeTicketIndex(docs.documents)
    })
    return Effect.gen(function* () {
      const tickets = yield* Tickets
      const read = yield* tickets.get("T-1")
      docs.documents.set(
        "T-1",
        makeTicketDocument("T-1", { body: "A concurrent edit" })
      )

      const error = yield* tickets
        .update("T-1", { body: "Template content" }, undefined, {
          body: read.body
        })
        .pipe(Effect.flip)

      expect(error).toMatchObject({
        _tag: "Validation",
        reason: "ticket_body_changed"
      })
      expect(docs.documents.get("T-1")?.body).toBe("A concurrent edit")
    }).pipe(Effect.provide(layer))
  }
)

it.effect("rejects an update when the ticket changed after it was read", () => {
  const docs = makeFakeTicketDocs(["T-1"])
  const layer = makeTicketsLayer("T", docs.layer, {
    ticketIndex: makeFakeTicketIndex(docs.documents)
  })
  return Effect.gen(function* () {
    const tickets = yield* Tickets
    const read = yield* tickets.get("T-1")
    docs.documents.set(
      "T-1",
      makeTicketDocument("T-1", {
        body: "A concurrent edit",
        updatedAt: isoDate("2026-04-02T00:00:00.000Z")
      })
    )

    const error = yield* tickets
      .update("T-1", { body: "Stale rewrite" }, undefined, {
        updatedAt: read.updatedAt
      })
      .pipe(Effect.flip)

    expect(error).toMatchObject({
      _tag: "Conflict",
      reason: "ticket_updated_since_read"
    })
    expect(docs.documents.get("T-1")?.body).toBe("A concurrent edit")

    const updated = yield* tickets.update(
      "T-1",
      { body: "Fresh rewrite" },
      undefined,
      { updatedAt: isoDate("2026-04-02T00:00:00.000Z") }
    )
    expect(updated.ticket.body).toBe("Fresh rewrite")
  }).pipe(Effect.provide(layer))
})

it.effect(
  "metadata edits skip attachment reconciliation while body edits retain it",
  () => {
    const docs = makeFakeTicketDocs(["T-1"])
    const attachments = makeRecordingAttachments()
    const layer = makeTicketsLayer("T", docs.layer, {
      attachments: attachments.layer
    })
    return Effect.gen(function* () {
      const tickets = yield* Tickets
      yield* tickets.update("T-1", {
        title: "New title",
        priority: "high"
      })
      expect(attachments.calls).toEqual([])
      yield* tickets.update("T-1", {
        body: "Updated description"
      })
      expect(attachments.calls).toEqual([
        {
          orgSlug: "org",
          slug: "p",
          ticketId: "T-1",
          body: "Updated description"
        }
      ])
    }).pipe(Effect.provide(layer))
  }
)

it.effect(
  "creating a branch preserves comments added during the GitHub request",
  () => {
    const docs = makeFakeTicketDocs(["T-1"])
    const layer = makeTicketsLayer("T", docs.layer, {
      projects: makeFakeProjects("T", {
        githubIntegration: () => Effect.succeed(githubIntegration)
      }),
      ticketIndex: makeFakeTicketIndex(docs.documents),
      github: makeFakeGitHub({
        createBranchAsUser: () =>
          docs.service
            .update("org", "p", "T-1", (document) =>
              Effect.succeed({
                ...document,
                commentsRegion: "Concurrent comment"
              })
            )
            .pipe(
              asUser("user-1"),
              Effect.as({ name: "feat/T-1", sha: "abc123" }),
              Effect.orDie
            )
      })
    })
    return Effect.gen(function* () {
      const tickets = yield* Tickets
      yield* tickets.createBranch("T-1", {
        name: "feat/T-1"
      })
      expect(docs.documents.get("T-1")).toMatchObject({
        branch: "feat/T-1",
        commentsRegion: "Concurrent comment"
      })
    }).pipe(Effect.provide(layer))
  }
)

it.effect(
  "sections returns matching counts and independently paginated status pages",
  () => {
    const { documents, layer } = makeTicketsFixture("T", [])
    for (let index = 1; index <= 52; index++) {
      documents.set(
        `T-${index}`,
        makeTicketDocument(`T-${index}`, {
          title: `needle ${index}`,
          status: ticketStatus("todo")
        })
      )
    }
    documents.set(
      "T-53",
      makeTicketDocument("T-53", {
        title: "needle in progress",
        status: ticketStatus("in_progress")
      })
    )
    documents.set(
      "T-54",
      makeTicketDocument("T-54", {
        title: "unrelated",
        status: ticketStatus("done")
      })
    )
    return Effect.gen(function* () {
      const tickets = yield* Tickets
      const query = { q: "needle", sort: { key: "id", dir: "asc" } } as const
      const snapshot = yield* tickets.sections(query)
      expect(snapshot.counts).toEqual({
        total: 53,
        byStatus: { todo: 52, in_progress: 1 }
      })
      const todo = snapshot.sections[ticketStatus("todo")]
      expect(todo.items).toHaveLength(50)
      expect(todo.nextCursor).not.toBeNull()
      expect(
        snapshot.sections[ticketStatus("in_progress")].items.map(
          ({ ticket }) => ticket.id
        )
      ).toEqual(["T-53"])
      const next = yield* tickets.list({
        ...query,
        status: [ticketStatus("todo")],
        cursor: todo.nextCursor ?? undefined
      })
      expect(next.items.map(({ ticket }) => ticket.id)).toEqual([
        "T-51",
        "T-52"
      ])
      expect(next.nextCursor).toBeNull()
      const selected = yield* tickets.sections({
        ...query,
        status: [ticketStatus("in_progress")]
      })
      expect(Object.keys(selected.sections)).toEqual(["in_progress"])
      expect(selected.counts).toEqual(snapshot.counts)
    }).pipe(Effect.provide(layer))
  }
)

function sprintGroup(
  id: string,
  tickets: ReadonlyArray<string>,
  completedAt: Date | null = null
): GroupDetail {
  return {
    id: groupId(id),
    name: id,
    kind: "sprint",
    tickets: tickets.map((id) => ticketId(id)),
    color: groupColor("#94a3b8"),
    startsAt: null,
    endsAt: null,
    completedAt,
    createdBy: "user-1",
    createdAt: isoDate("2026-01-01T00:00:00.000Z"),
    updatedAt: isoDate("2026-01-01T00:00:00.000Z"),
    body: ""
  }
}

function makeFakeSprintGroups(sprints: ReadonlyArray<GroupDetail>) {
  const byId = new Map(sprints.map((sprint) => [sprint.id, sprint]))
  const isGroupId = Schema.is(GroupId)
  return Layer.succeed(Groups, {
    list: () => Effect.succeed(sprints),
    listPaged: () => unexpected("Groups.listPaged"),
    listSprintsPaged: () => unexpected("Groups.listSprintsPaged"),
    get: (id) => {
      if (!isGroupId(id)) return Effect.fail(new NotFound())
      const sprint = byId.get(id)
      return sprint === undefined
        ? Effect.fail(new NotFound())
        : Effect.succeed(sprint)
    },
    create: () => unexpected("Groups.create"),
    update: () => unexpected("Groups.update"),
    updateTickets: () => unexpected("Groups.updateTickets"),
    addTickets: () => unexpected("Groups.addTickets"),
    removeTickets: () => unexpected("Groups.removeTickets"),
    updateTicketOrder: () => unexpected("Groups.updateTicketOrder"),
    complete: () => unexpected("Groups.complete"),
    remove: () => unexpected("Groups.remove"),
    ensureSprintAssignable: () => Effect.void,
    setSprintMembership: () => Effect.void,
    removeTicketFromAllGroups: () => Effect.void
  } satisfies GroupsShape)
}

it.effect(
  "sprintSections returns matching counts and independently paginated sprint pages",
  () => {
    const docs = makeFakeTicketDocs([])
    const { documents } = docs
    for (let index = 1; index <= 52; index++) {
      documents.set(
        `T-${index}`,
        makeTicketDocument(`T-${index}`, { title: `sprint ${index}` })
      )
    }
    documents.set(
      "T-53",
      makeTicketDocument("T-53", { title: "unscheduled leftover" })
    )
    const sprintIds = Array.from({ length: 52 }, (_, index) => `T-${index + 1}`)
    const g1 = sprintGroup("G-1", sprintIds)
    const g2 = sprintGroup("G-2", [])
    const layer = makeTicketsLayer("T", docs.layer, {
      ticketIndex: makeFakeTicketIndex(documents),
      groups: makeFakeSprintGroups([g1, g2])
    })
    return Effect.gen(function* () {
      const tickets = yield* Tickets
      const query = { sort: { key: "id", dir: "asc" } } as const
      const snapshot = yield* tickets.sprintSections(query)
      expect(snapshot.total).toBe(53)
      const g1Section = snapshot.sections.find(
        (section) => section.key === g1.id
      )
      const g2Section = snapshot.sections.find(
        (section) => section.key === g2.id
      )
      const unscheduled = snapshot.sections.find(
        (section) => section.key === "unscheduled"
      )
      expect(g1Section?.count).toBe(52)
      expect(g1Section?.page.items).toHaveLength(50)
      expect(g1Section?.page.nextCursor).not.toBeNull()
      expect(g2Section?.page.items).toEqual([])
      expect(unscheduled?.page.items.map(({ ticket }) => ticket.id)).toEqual([
        "T-53"
      ])
      const next = yield* tickets.list({
        ...query,
        groupId: [g1.id],
        cursor: g1Section?.page.nextCursor ?? undefined
      })
      expect(next.items.map(({ ticket }) => ticket.id)).toEqual([
        "T-51",
        "T-52"
      ])
      expect(next.nextCursor).toBeNull()
      const selected = yield* tickets.sprintSections({
        ...query,
        groupId: [g2.id]
      })
      expect(selected.sections.map((section) => section.key)).toEqual([g2.id])
      expect(selected.total).toBe(0)
    }).pipe(Effect.provide(layer))
  }
)

it.effect(
  "sprintSections counts the selected sections across every status",
  () => {
    const docs = makeFakeTicketDocs([])
    const { documents } = docs
    documents.set("T-1", makeTicketDocument("T-1"))
    documents.set(
      "T-2",
      makeTicketDocument("T-2", { status: ticketStatus("review") })
    )
    documents.set(
      "T-3",
      makeTicketDocument("T-3", { status: ticketStatus("review") })
    )
    documents.set("T-4", makeTicketDocument("T-4"))
    const g1 = sprintGroup("G-1", ["T-1", "T-2"])
    const g2 = sprintGroup("G-2", ["T-3"])
    const layer = makeTicketsLayer("T", docs.layer, {
      ticketIndex: makeFakeTicketIndex(documents),
      groups: makeFakeSprintGroups([g1, g2])
    })
    return Effect.gen(function* () {
      const tickets = yield* Tickets
      const query = {
        sort: { key: "id", dir: "asc" },
        status: [ticketStatus("review")]
      } as const
      const all = yield* tickets.sprintSections(query)
      expect(all.total).toBe(2)
      expect(all.counts).toEqual({
        total: 4,
        byStatus: { todo: 2, review: 2 }
      })
      const selected = yield* tickets.sprintSections({
        ...query,
        groupId: [g1.id]
      })
      expect(
        selected.sections.map(({ key, count }) => ({ key, count }))
      ).toEqual([{ key: g1.id, count: 1 }])
      expect(selected.counts).toEqual({
        total: 2,
        byStatus: { todo: 1, review: 1 }
      })
      const repeated = yield* tickets.sprintSections({
        ...query,
        status: [ticketStatus("review"), ticketStatus("review")],
        groupId: [g1.id, g1.id]
      })
      expect(repeated.total).toBe(1)
      expect(repeated.sections).toHaveLength(1)
      expect(repeated.sections[0]?.count).toBe(1)
      expect(repeated.counts).toEqual(selected.counts)
    }).pipe(Effect.provide(layer))
  }
)

it.effect("sprintSections assigns each ticket to one section", () => {
  const docs = makeFakeTicketDocs([])
  const { documents } = docs
  documents.set("T-1", makeTicketDocument("T-1", { title: "done leftover" }))
  documents.set("T-2", makeTicketDocument("T-2", { title: "still active" }))
  documents.set("T-3", makeTicketDocument("T-3", { title: "unscheduled" }))
  const done = sprintGroup(
    "G-1",
    ["T-1", "T-2"],
    isoDate("2026-04-01T00:00:00.000Z")
  )
  const active = sprintGroup("G-2", ["T-2"])
  const layer = makeTicketsLayer("T", docs.layer, {
    ticketIndex: makeFakeTicketIndex(documents),
    groups: makeFakeSprintGroups([done, active])
  })
  return Effect.gen(function* () {
    const tickets = yield* Tickets
    const snapshot = yield* tickets.sprintSections({
      sort: { key: "id", dir: "asc" }
    })
    const doneSection = snapshot.sections.find(
      (section) => section.key === done.id
    )
    const activeSection = snapshot.sections.find(
      (section) => section.key === active.id
    )
    const unscheduled = snapshot.sections.find(
      (section) => section.key === "unscheduled"
    )
    expect(doneSection?.page.items.map(({ ticket }) => ticket.id)).toEqual([
      "T-1"
    ])
    expect(activeSection?.page.items.map(({ ticket }) => ticket.id)).toEqual([
      "T-2"
    ])
    expect(unscheduled?.page.items.map(({ ticket }) => ticket.id)).toEqual([
      "T-3"
    ])
    expect(snapshot.total).toBe(3)

    const ungroupedQuery = {
      sort: { key: "id", dir: "asc" },
      groupId: ["ungrouped"]
    } as const
    const ungroupedList = yield* tickets.list(ungroupedQuery)
    const ungroupedSections = yield* tickets.sprintSections(ungroupedQuery)
    expect(ungroupedSections.sections).toHaveLength(1)
    expect(
      ungroupedSections.sections[0]?.page.items.map(({ ticket }) => ticket.id)
    ).toEqual(ungroupedList.items.map(({ ticket }) => ticket.id))
    expect(ungroupedSections.counts.total).toBe(2)

    const completedOnly = yield* tickets.sprintSections({
      ...ungroupedQuery,
      groupId: [done.id]
    })
    expect(
      completedOnly.sections[0]?.page.items.map(({ ticket }) => ticket.id)
    ).toEqual(["T-1", "T-2"])

    const both = yield* tickets.sprintSections({
      ...ungroupedQuery,
      groupId: ["ungrouped", done.id]
    })
    expect(both.counts.total).toBe(3)
    expect(
      both.sections.flatMap((section) =>
        section.page.items.map(({ ticket }) => ticket.id)
      )
    ).toEqual(["T-3", "T-1", "T-2"])
  }).pipe(Effect.provide(layer))
})

const scopeAs = (
  orgRole: "owner" | "admin" | "member" | "guest",
  role: "pm" | "developer" | "client" | null,
  userId: string
) =>
  projectScope(orgRole, role, {
    userId,
    orgSlug: "org",
    slug: "p",
    projectId: "p",
    organizationId: "org"
  })

const permissionFixture = () => {
  const docs = makeFakeTicketDocs([])
  docs.documents.set(
    "T-1",
    makeTicketDocument("T-1", { createdBy: "user-2", branch: "feat/T-1" })
  )
  docs.documents.set(
    "T-2",
    makeTicketDocument("T-2", { createdBy: "client-1" })
  )
  const layer = makeTicketsLayer("T", docs.layer, {
    ticketIndex: makeFakeTicketIndex(docs.documents),
    projects: makeFakeProjects("T", {
      githubIntegration: () => Effect.succeed(githubIntegration),
      memberIds: () => Effect.succeed(new Set(["user-1", "user-2", "client-1"]))
    })
  })
  return { docs, layer }
}

const as = (scope: ProjectScopeShape) =>
  Effect.provideService(ProjectScope, scope)

it.effect(
  "lets a client edit any ticket and change its status and assignees",
  () => {
    const { docs, layer } = permissionFixture()
    const client = as(scopeAs("guest", "client", "client-1"))
    return Effect.gen(function* () {
      const tickets = yield* Tickets
      yield* tickets
        .update("T-1", {
          title: "Clearer title",
          status: ticketStatus("done"),
          assignees: ["user-1"]
        })
        .pipe(client)
      expect(docs.documents.get("T-1")).toMatchObject({
        title: "Clearer title",
        status: "done",
        assignees: ["user-1"],
        updatedBy: "client-1"
      })
      const created = yield* tickets
        .create({
          title: "Placed",
          status: ticketStatus("in_progress"),
          assignees: ["user-1"]
        })
        .pipe(client)
      expect(created.status).toBe("in_progress")
    }).pipe(Effect.provide(layer))
  }
)

it.effect("rejects statuses the project doesn't have", () => {
  const { docs, layer } = permissionFixture()
  const pm = as(scopeAs("member", "pm", "user-1"))
  return Effect.gen(function* () {
    const tickets = yield* Tickets
    const updating = yield* Effect.flip(
      tickets.update("T-1", { status: ticketStatus("bogus") }).pipe(pm)
    )
    const creating = yield* Effect.flip(
      tickets.create({ title: "New", status: ticketStatus("bogus") }).pipe(pm)
    )
    expect([updating._tag, creating._tag]).toStrictEqual([
      "Validation",
      "Validation"
    ])
    expect(docs.documents.get("T-1")?.status).toBe("todo")
  }).pipe(Effect.provide(layer))
})

it.effect(
  "clears old-unit estimates on active and archived tickets while retaining current-unit estimates",
  () => {
    const docs = makeFakeTicketDocs(["T-1", "T-2", "T-3", "T-4"])
    for (const [id, archived, unit] of [
      ["T-1", false, "time"],
      ["T-2", true, "time"],
      ["T-3", false, "points"],
      ["T-4", true, "points"]
    ] as const) {
      docs.documents.set(
        id,
        makeTicketDocument(id, {
          estimate:
            unit === "time" ? { unit, minutes: 60 } : { unit, value: 5 },
          archivedAt: archived ? isoDate("2026-04-01T00:00:00Z") : null
        })
      )
    }
    const layer = makeTicketsLayer("T", docs.layer, {
      ticketIndex: makeFakeTicketIndex(docs.documents)
    })
    return Effect.gen(function* () {
      const tickets = yield* Tickets
      expect(yield* tickets.clearStaleEstimates()).toEqual({ cleared: 2 })
      expect(docs.documents.get("T-1")?.estimate).toBeUndefined()
      expect(docs.documents.get("T-2")?.estimate).toBeUndefined()
      expect(docs.documents.get("T-2")?.archivedAt).not.toBeNull()
      expect(docs.documents.get("T-3")?.estimate).toEqual({
        unit: "points",
        value: 5
      })
      expect(docs.documents.get("T-4")?.estimate).toEqual({
        unit: "points",
        value: 5
      })
      expect(yield* tickets.clearStaleEstimates()).toEqual({ cleared: 0 })
    }).pipe(Effect.provide(layer))
  }
)

it.effect(
  "preserves estimates made current by a mode change during bulk cleanup",
  () => {
    const docs = makeFakeTicketDocs(["T-1"])
    docs.documents.set(
      "T-1",
      makeTicketDocument("T-1", { estimate: { unit: "time", minutes: 60 } })
    )
    let switched = false
    const layer = makeTicketsLayer("T", docs.layer, {
      projectDocs: Layer.mock(ProjectDocs, {
        read: (_org, slug) =>
          Effect.succeed({
            slug,
            name: slug,
            icon: "folder",
            color: "#3b82f6",
            createdAt: isoDate("2026-01-01T00:00:00Z"),
            github: null,
            estimation: switched ? "time" : "points",
            body: "",
            templateDefaults: {},
            setup: {
              workflowReviewedAt: null,
              invitePeopleDismissedAt: null,
              connectGithubDismissedAt: null
            }
          })
      }),
      ticketIndex: makeFakeTicketIndex(docs.documents, {
        query: () =>
          Effect.sync(() => {
            switched = true
            const current = docs.documents.get("T-1")
            if (!current) throw new Error("Ticket fixture missing")
            return [
              { entry: entryFromDocument(current), sortValue: "", orderKey: "" }
            ]
          })
      })
    })
    return Effect.gen(function* () {
      const tickets = yield* Tickets
      expect(yield* tickets.clearStaleEstimates()).toEqual({ cleared: 0 })
      expect(docs.documents.get("T-1")?.estimate).toEqual({
        unit: "time",
        minutes: 60
      })
    }).pipe(Effect.provide(layer))
  }
)

it.effect(
  "preserves an estimate changed to the current unit after cleanup selection",
  () => {
    const docs = makeFakeTicketDocs(["T-1"])
    docs.documents.set(
      "T-1",
      makeTicketDocument("T-1", { estimate: { unit: "time", minutes: 60 } })
    )
    const layer = makeTicketsLayer("T", docs.layer, {
      ticketIndex: makeFakeTicketIndex(docs.documents, {
        query: () =>
          Effect.sync(() => {
            const previous = docs.documents.get("T-1")
            if (!previous) throw new Error("Ticket fixture missing")
            docs.documents.set("T-1", {
              ...previous,
              estimate: { unit: "points", value: 8 }
            })
            return [
              {
                entry: entryFromDocument(previous),
                sortValue: "",
                orderKey: ""
              }
            ]
          })
      })
    })
    return Effect.gen(function* () {
      const tickets = yield* Tickets
      expect(yield* tickets.clearStaleEstimates()).toEqual({ cleared: 0 })
      expect(docs.documents.get("T-1")?.estimate).toEqual({
        unit: "points",
        value: 8
      })
    }).pipe(Effect.provide(layer))
  }
)

it.effect("only accepts estimates in the project's estimation unit", () => {
  const { docs, layer } = permissionFixture()
  const pm = as(scopeAs("member", "pm", "user-1"))
  return Effect.gen(function* () {
    const tickets = yield* Tickets
    const mismatched = yield* Effect.flip(
      tickets
        .update("T-1", { estimate: { unit: "tshirt", value: "M" } })
        .pipe(pm)
    )
    expect(mismatched._tag).toBe("Validation")
    expect(docs.documents.get("T-1")?.estimate).toBeUndefined()

    yield* tickets
      .update("T-1", { estimate: { unit: "points", value: 5 } })
      .pipe(pm)
    expect(docs.documents.get("T-1")?.estimate).toEqual({
      unit: "points",
      value: 5
    })

    yield* tickets.update("T-1", { estimate: null }).pipe(pm)
    expect(docs.documents.get("T-1")?.estimate).toBeUndefined()
  }).pipe(Effect.provide(layer))
})

it.effect(
  "moves a ticket on the sprint board only with permission to transition it",
  () => {
    const docs = makeFakeTicketDocs([])
    docs.documents.set("T-1", makeTicketDocument("T-1"))
    const orders: Array<unknown> = []
    const sprint = decodeGroupDetailSync({
      id: "G-1",
      name: "Sprint",
      kind: "sprint",
      tickets: ["T-1"],
      color: "#123456",
      startsAt: null,
      endsAt: null,
      completedAt: null,
      createdBy: "user-1",
      createdAt: "2026-04-01T00:00:00.000Z",
      updatedAt: "2026-04-01T00:00:00.000Z",
      body: ""
    })
    const layer = makeTicketsLayer("T", docs.layer, {
      ticketIndex: makeFakeTicketIndex(docs.documents),
      groups: makeFakeGroups({
        updateTicketOrder: (_id, input, beforeWrite = Effect.void) =>
          beforeWrite.pipe(
            Effect.andThen(
              Effect.sync(() => {
                orders.push(input)
                return sprint
              })
            )
          )
      })
    })
    return Effect.gen(function* () {
      const tickets = yield* Tickets
      const move = { ticketId: ticketId("T-1"), after: null }
      const readOnly = yield* Effect.flip(
        tickets
          .moveInGroup("G-1", { ...move, status: ticketStatus("done") })
          .pipe(as(scopeAs("admin", null, "admin-1")))
      )
      const unknown = yield* Effect.flip(
        tickets
          .moveInGroup("G-1", { ...move, status: ticketStatus("bogus") })
          .pipe(as(scopeAs("guest", "client", "client-1")))
      )
      expect([readOnly._tag, unknown._tag]).toStrictEqual([
        "Forbidden",
        "Validation"
      ])
      expect(orders).toStrictEqual([])

      yield* tickets
        .moveInGroup("G-1", { ...move, status: ticketStatus("in_progress") })
        .pipe(as(scopeAs("guest", "client", "client-1")))
      expect(orders).toStrictEqual([move])
      expect(docs.documents.get("T-1")).toMatchObject({
        status: "in_progress",
        updatedBy: "client-1"
      })
    }).pipe(Effect.provide(layer))
  }
)

it.effect("hides GitHub state from anyone without github:read", () => {
  const { layer } = permissionFixture()
  return Effect.gen(function* () {
    const tickets = yield* Tickets
    const developerView = yield* tickets
      .get("T-1")
      .pipe(as(scopeAs("member", "developer", "user-1")))
    const clientView = yield* tickets
      .get("T-1")
      .pipe(as(scopeAs("guest", "client", "client-1")))
    expect(developerView.branch).toBe("feat/T-1")
    expect(clientView).toMatchObject({
      branch: null,
      pr: null,
      prState: null,
      lastTransitionedPr: null,
      gitState: { tag: "no_branch" }
    })
  }).pipe(Effect.provide(layer))
})

it.effect("refuses GitHub filters to anyone without github:read", () => {
  const { layer } = permissionFixture()
  const client = as(scopeAs("guest", "client", "client-1"))
  return Effect.gen(function* () {
    const tickets = yield* Tickets
    const withBranch = yield* tickets
      .list({ sort: DEFAULT_TICKET_SORT, hasBranch: true })
      .pipe(as(scopeAs("member", "developer", "user-1")))
    expect(withBranch.items.map(({ ticket }) => ticket.id)).toEqual(["T-1"])
    const refused = [
      yield* Effect.flip(
        tickets
          .list({ sort: DEFAULT_TICKET_SORT, hasBranch: true })
          .pipe(client)
      ),
      yield* Effect.flip(tickets.count({ hasPr: false }).pipe(client)),
      yield* Effect.flip(
        tickets
          .sections({ sort: DEFAULT_TICKET_SORT, hasPr: true })
          .pipe(client)
      ),
      yield* Effect.flip(
        tickets
          .sprintSections({ sort: DEFAULT_TICKET_SORT, hasBranch: false })
          .pipe(client)
      )
    ]
    expect(refused.map((error) => error._tag)).toStrictEqual([
      "Forbidden",
      "Forbidden",
      "Forbidden",
      "Forbidden"
    ])
    const unfiltered = yield* tickets
      .list({ sort: DEFAULT_TICKET_SORT })
      .pipe(client)
    expect(unfiltered.items).toHaveLength(2)
  }).pipe(Effect.provide(layer))
})

it.effect("keeps org admins without a role from editing", () => {
  const { docs, layer } = permissionFixture()
  return Effect.gen(function* () {
    const tickets = yield* Tickets
    const adminView = yield* tickets
      .get("T-1")
      .pipe(as(scopeAs("admin", null, "admin-1")))
    const adminEdit = yield* Effect.flip(
      tickets
        .update("T-1", { title: "Admin" })
        .pipe(as(scopeAs("admin", null, "admin-1")))
    )
    expect(adminView.id).toBe("T-1")
    expect(adminEdit._tag).toBe("Forbidden")
    expect(docs.documents.has("T-1")).toBe(true)
  }).pipe(Effect.provide(layer))
})

it.effect(
  "listGitStates fires the branch deleted rule once for a branch gone from GitHub",
  () => {
    const docs = makeFakeTicketDocs(["T-1"])
    docs.documents.set(
      "T-1",
      makeTicketDocument("T-1", {
        branch: "feat/T-1",
        status: ticketStatus("in_review"),
        updatedAt: DateTime.toDate(DateTime.makeUnsafe("2026-05-01T00:00:00Z"))
      })
    )
    const stale = new Set<string>()
    const diskFull = new MarkdownError({ message: "disk full", cause: null })
    let failMove = true
    const failingDocs: TicketDocsShape = {
      ...docs.service,
      update: (org, slug, id, transform, onPersist, activity) =>
        docs.service.update(
          org,
          slug,
          id,
          (current) =>
            transform(current).pipe(
              Effect.tap((next) => {
                if (next.status !== "todo" || !failMove) return Effect.void
                failMove = false
                return Effect.fail(diskFull)
              })
            ),
          onPersist,
          activity
        )
    }
    const layer = makeTicketsLayer(
      "T",
      Layer.succeed(TicketDocs, failingDocs),
      {
        projects: makeFakeProjects("T", {
          githubIntegration: () => Effect.succeed(githubIntegration)
        }),
        ticketIndex: makeFakeTicketIndex(docs.documents, {
          list: () =>
            Effect.sync(() =>
              [...docs.documents.values()].map((document) => ({
                ...entryFromDocument(document),
                branchDeletedAt: stale.has(document.id)
                  ? DateTime.toDate(DateTime.makeUnsafe("2026-06-01T00:00:00Z"))
                  : null
              }))
            ),
          markBranchStale: (_projectId, branch) =>
            Effect.sync(() =>
              [...docs.documents.values()].flatMap((document) => {
                if (document.branch !== branch || stale.has(document.id)) {
                  return []
                }
                stale.add(document.id)
                return [document.id]
              })
            )
        }),
        github: makeFakeGitHub({
          fetchInstallationProjectStates: () =>
            Effect.succeed({
              defaultBranch: "main",
              openPullRequestText: new Map(),
              mergedPrsByBranch: new Map(),
              existingBranches: new Set(),
              prByBranch: new Map([["feat/T-1", mergedPullRequest("main")]]),
              fetchedAt: DateTime.toDate(
                DateTime.makeUnsafe("2026-06-01T00:00:00Z")
              )
            })
        }),
        gitAutomation: {
          ...DEFAULT_GIT_AUTOMATION_CONFIG,
          rules: {
            ...DEFAULT_GIT_AUTOMATION_CONFIG.rules,
            branch_deleted: ticketStatus("todo")
          },
          forwardOnly: false
        }
      }
    )
    return Effect.gen(function* () {
      const tickets = yield* Tickets
      expect(yield* Effect.flip(tickets.listGitStates())).toEqual(diskFull)
      expect(stale.size).toBe(0)
      const first = yield* tickets.listGitStates()
      expect(first.changedTicketIds).toEqual(["T-1"])
      expect(docs.documents.get("T-1")?.status).toBe(ticketStatus("todo"))

      const moved = docs.documents.get("T-1")
      if (moved) {
        docs.documents.set("T-1", {
          ...moved,
          status: ticketStatus("in_progress")
        })
      }
      yield* tickets.listGitStates()
      expect(docs.documents.get("T-1")?.status).toBe(
        ticketStatus("in_progress")
      )
    }).pipe(Effect.provide(layer))
  }
)

const stackLayer = (
  docs: ReturnType<typeof makeFakeTicketDocs>,
  github: Partial<GitHubShape> = {}
) =>
  makeTicketsLayer("T", docs.layer, {
    projects: makeFakeProjects("T", {
      githubIntegration: () => Effect.succeed(githubIntegration)
    }),
    ticketIndex: makeFakeTicketIndex(docs.documents),
    github: makeFakeGitHub({
      branchExistsInstallation: (_installation, _owner, _repo, branch) =>
        Effect.succeed(branch !== "missing"),
      fetchInstallationProjectStates: () =>
        Effect.succeed({
          defaultBranch: "main",
          mergedPrsByBranch: new Map(),
          openPullRequestText: new Map(),
          fetchedAt: isoDate("2026-04-01T00:00:00Z"),
          existingBranches: new Set(),
          prByBranch: new Map()
        }),
      ...github
    })
  })

it.effect(
  "stackBranch adds a branch on top of the ticket's own and forgets it was ignored",
  () => {
    const docs = makeFakeTicketDocs(["T-1"])
    docs.documents.set(
      "T-1",
      makeTicketDocument("T-1", {
        branch: "feat/T-1",
        ignoredBranches: ["feat/T-1-ui"]
      })
    )
    return Effect.gen(function* () {
      const tickets = yield* Tickets
      yield* tickets.stackBranch("T-1", { name: "feat/T-1-ui" })

      expect(docs.documents.get("T-1")).toMatchObject({
        branch: "feat/T-1",
        stack: [
          {
            branch: "feat/T-1-ui",
            base: "feat/T-1",
            pr: 43,
            prState: "open",
            prDraft: true
          }
        ],
        ignoredBranches: []
      })
    }).pipe(
      Effect.provide(
        stackLayer(docs, {
          fetchInstallationProjectStates: () =>
            Effect.succeed({
              defaultBranch: "main",
              openPullRequestText: new Map(),
              fetchedAt: isoDate("2026-04-01T00:00:00Z"),
              mergedPrsByBranch: new Map(),
              existingBranches: new Set(["feat/T-1-ui"]),
              prByBranch: new Map([
                [
                  "feat/T-1-ui",
                  {
                    ...mergedPullRequest("feat/T-1"),
                    state: "open",
                    draft: true,
                    number: 43
                  }
                ]
              ])
            })
        })
      )
    )
  }
)

it.effect("attachBranch refuses a branch already stacked on the ticket", () => {
  const docs = makeFakeTicketDocs(["T-1"])
  docs.documents.set(
    "T-1",
    makeTicketDocument("T-1", {
      branch: "feat/T-1",
      stack: [{ branch: "feat/T-1-ui", base: "feat/T-1" }]
    })
  )
  return Effect.gen(function* () {
    const tickets = yield* Tickets
    const failure = yield* Effect.flip(
      tickets.attachBranch("T-1", { name: "feat/T-1-ui" })
    )

    expect(failure).toEqual(
      new Conflict({ reason: "branch_already_on_ticket" })
    )
    expect(docs.documents.get("T-1")).toMatchObject({ branch: "feat/T-1" })
  }).pipe(Effect.provide(stackLayer(docs)))
})

it.effect("attachBranch rejects a branch stacked on another ticket", () => {
  const docs = makeFakeTicketDocs(["T-1", "T-2"])
  docs.documents.set(
    "T-1",
    makeTicketDocument("T-1", {
      branch: "feat/T-1",
      stack: [{ branch: "shared-ui", base: "feat/T-1" }]
    })
  )
  return Effect.gen(function* () {
    const tickets = yield* Tickets
    expect(
      yield* Effect.flip(tickets.attachBranch("T-2", { name: "shared-ui" }))
    ).toEqual(new Conflict({ reason: "branch_on_other_ticket" }))
    expect(docs.documents.get("T-2")?.branch).toBeNull()
  }).pipe(Effect.provide(stackLayer(docs)))
})

it.effect("stackBranch refuses branches that can't be stacked", () => {
  const docs = makeFakeTicketDocs(["T-1", "T-2", "T-3"])
  docs.documents.set(
    "T-1",
    makeTicketDocument("T-1", {
      branch: "feat/T-1",
      stack: [{ branch: "feat/T-1-ui" }]
    })
  )
  docs.documents.set("T-3", makeTicketDocument("T-3", { branch: "feat/T-3" }))
  return Effect.gen(function* () {
    const tickets = yield* Tickets
    const failures = yield* Effect.forEach(
      [
        ["T-2", "feat/T-2-ui"],
        ["T-1", "feat/T-1"],
        ["T-1", "feat/T-1-ui"],
        ["T-1", "missing"],
        ["T-1", "feat/T-3"]
      ] as const,
      ([id, name]) => Effect.flip(tickets.stackBranch(id, { name }))
    )

    expect(failures).toEqual([
      new Conflict({ reason: "no_branch_on_ticket" }),
      new Conflict({ reason: "branch_already_on_ticket" }),
      new Conflict({ reason: "branch_already_on_ticket" }),
      new BranchNotFound({ name: "missing" }),
      new Conflict({ reason: "branch_on_other_ticket" })
    ])
  }).pipe(Effect.provide(stackLayer(docs)))
})

it.effect(
  "unstackBranch removes a stacked branch and ignores it from then on",
  () => {
    const docs = makeFakeTicketDocs(["T-1"])
    docs.documents.set(
      "T-1",
      makeTicketDocument("T-1", {
        branch: "feat/T-1",
        stack: [{ branch: "feat/T-1-ui" }, { branch: "feat/T-1-docs" }]
      })
    )
    return Effect.gen(function* () {
      const tickets = yield* Tickets
      yield* tickets.unstackBranch("T-1", { name: "feat/T-1-ui" })
      const missing = yield* Effect.flip(
        tickets.unstackBranch("T-1", { name: "feat/T-1-ui" })
      )

      expect(docs.documents.get("T-1")).toMatchObject({
        stack: [{ branch: "feat/T-1-docs" }],
        ignoredBranches: ["feat/T-1-ui"]
      })
      expect(missing).toEqual(new Conflict({ reason: "branch_not_stacked" }))
    }).pipe(Effect.provide(stackLayer(docs)))
  }
)

it.effect("clearBranch drops the stack and the pull request base", () => {
  const docs = makeFakeTicketDocs(["T-1"])
  docs.documents.set(
    "T-1",
    makeTicketDocument("T-1", {
      branch: "feat/T-1",
      pr: 41,
      prState: "open",
      prBase: "main",
      stack: [{ branch: "feat/T-1-ui" }]
    })
  )
  return Effect.gen(function* () {
    const tickets = yield* Tickets
    yield* tickets.clearBranch("T-1")

    const cleared = docs.documents.get("T-1")
    expect(cleared?.branch).toBeNull()
    expect(cleared?.stack).toEqual([])
    expect(cleared).not.toHaveProperty("prBase")
  }).pipe(Effect.provide(stackLayer(docs)))
})

it.effect(
  "listGitStates stacks a discovered pull request and follows stacked ones",
  () => {
    const docs = makeFakeTicketDocs(["T-1"])
    docs.documents.set(
      "T-1",
      makeTicketDocument("T-1", {
        branch: "feat/T-1",
        pr: 41,
        prState: "open",
        prBase: "main",
        stack: [{ branch: "feat/T-1-api", base: "feat/T-1" }]
      })
    )
    const requested: Array<ReadonlyArray<string>> = []
    const pr = (
      headRefName: string,
      baseRefName: string,
      number: number,
      state: "open" | "merged" = "open"
    ) =>
      [
        headRefName,
        {
          headRefName,
          baseRefName,
          state,
          draft: false,
          number,
          url: `https://github.com/acme/app/pull/${number}`,
          title: headRefName,
          mergedAt: null,
          checks: "passing" as const
        }
      ] as const
    const layer = stackLayer(docs, {
      fetchInstallationProjectStates: (_i, _o, _r, branches) => {
        requested.push(branches)
        return Effect.succeed({
          defaultBranch: "main",
          fetchedAt: isoDate("2026-04-01T00:00:00Z"),
          mergedPrsByBranch: new Map(),
          existingBranches: new Set([
            "feat/T-1",
            "feat/T-1-api",
            "checkout-ui"
          ]),
          prByBranch: new Map([
            pr("feat/T-1", "main", 41),
            pr("feat/T-1-api", "feat/T-1", 42, "merged"),
            pr("checkout-ui", "feat/T-1-api", 43)
          ]),
          openPullRequestText: new Map([
            ["checkout-ui", { title: "T-1: checkout UI", body: "" }]
          ])
        })
      }
    })
    return Effect.gen(function* () {
      const tickets = yield* Tickets
      const result = yield* tickets.listGitStates()

      expect(requested).toEqual([["feat/T-1", "feat/T-1-api"]])
      expect(result.changedTicketIds).toEqual(["T-1"])
      expect(
        result.stacks?.["T-1"]?.map((layer) => [
          layer.branch,
          layer.depth,
          layer.pr?.state
        ])
      ).toEqual([
        ["feat/T-1-api", 1, "merged"],
        ["checkout-ui", 2, "open"]
      ])
      expect(docs.documents.get("T-1")?.stack).toEqual([
        { branch: "feat/T-1-api", base: "feat/T-1", pr: 42, prState: "merged" },
        { branch: "checkout-ui", base: "feat/T-1-api", pr: 43, prState: "open" }
      ])
    }).pipe(Effect.provide(layer))
  }
)

it.effect(
  "listGitStates discovers stack branches even when the owning PR is merged",
  () => {
    const docs = makeFakeTicketDocs(["T-1"])
    docs.documents.set(
      "T-1",
      makeTicketDocument("T-1", {
        branch: "feat/T-1",
        pr: 41,
        prState: "merged",
        lastTransitionedPr: 41
      })
    )
    const queries: Array<string | undefined> = []
    const layer = stackLayer(docs, {
      fetchInstallationProjectStates: (_i, _o, _r, _branches, query) => {
        queries.push(query)
        return Effect.succeed({
          defaultBranch: "main",
          openPullRequestText: new Map(),
          fetchedAt: isoDate("2026-04-01T00:00:00Z"),
          mergedPrsByBranch: new Map(),
          existingBranches: new Set(),
          prByBranch: new Map()
        })
      }
    })
    return Effect.gen(function* () {
      const tickets = yield* Tickets
      yield* tickets.listGitStates()
      expect(queries).toEqual(["T-"])
    }).pipe(Effect.provide(layer))
  }
)

it.effect(
  "listGitStates lands a merge once the branch it went into reaches the default branch",
  () => {
    const docs = makeFakeTicketDocs(["T-1"])
    docs.documents.set(
      "T-1",
      makeTicketDocument("T-1", {
        branch: "api",
        pr: 41,
        prState: "merged",
        prBase: "feat/base",
        lastTransitionedPr: null
      })
    )
    const requested: Array<ReadonlyArray<string>> = []
    const merged = (
      headRefName: string,
      baseRefName: string,
      number: number,
      mergedAt: string
    ) =>
      [
        headRefName,
        {
          headRefName,
          baseRefName,
          state: "merged" as const,
          draft: false,
          number,
          url: `https://github.com/acme/app/pull/${number}`,
          title: headRefName,
          mergedAt: DateTime.toDate(DateTime.makeUnsafe(mergedAt)),
          checks: "passing" as const
        }
      ] as const
    const layer = stackLayer(docs, {
      fetchInstallationProjectStates: (_i, _o, _r, branches) => {
        requested.push(branches)
        return Effect.succeed({
          defaultBranch: "main",
          mergedPrsByBranch: new Map(),
          openPullRequestText: new Map(),
          fetchedAt: isoDate("2026-04-01T00:00:00Z"),
          existingBranches: new Set(["api"]),
          prByBranch: new Map([
            merged("api", "feat/base", 41, "2026-05-01T09:00:00Z"),
            merged("feat/base", "main", 50, "2026-05-01T10:00:00Z")
          ])
        })
      }
    })
    return Effect.gen(function* () {
      const tickets = yield* Tickets
      yield* tickets.listGitStates()

      expect(requested).toEqual([["api", "feat/base"]])
      expect(docs.documents.get("T-1")).toMatchObject({
        lastTransitionedPr: 41,
        status: ticketStatus("done")
      })
    }).pipe(Effect.provide(layer))
  }
)
