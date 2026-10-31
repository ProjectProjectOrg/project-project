import {
  ActivityActor,
  Group,
  matchesTicketQuery,
  NotFound,
  padNumericIdSort,
  paginateSorted,
  GroupColor,
  GroupDetail,
  GroupId,
  ProjectKey,
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
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"

import { databaseLayer } from "../../test/database"
import { accessLayer, projectScope } from "../access/testing"
import { passthroughTicketActivity } from "../activity/testing"
import { Attachments, type AttachmentsShape } from "../attachments/Attachments"
import { Comments, type CommentsShape } from "../comments/Comments"
import { FigmaLinks, type FigmaLinksShape } from "../figma/FigmaLinks"
import { GitHub, type GitHubShape } from "../github/GitHub"
import { Groups, type GroupsShape } from "../groups/Groups"
import { Library } from "../library/Library"
import { TicketIdTaken } from "../markdown/Markdown"
import { FinishedStatuses } from "../projects/FinishedStatuses"
import { gitAutomationTestLayer } from "../projects/gitAutomationTesting"
import { ProjectDocs } from "../projects/ProjectDocs"
import {
  Projects,
  type ProjectGithubIntegration,
  type ProjectsShape
} from "../projects/Projects"
import { Users, type UsersShape } from "../users/Users"
import type { GitAutomationConfig } from "./gitAutomation"
import * as TicketServices from "./layer"
import * as TicketBranchIndex from "./TicketBranchIndex"
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

export const decodeGroupSync = Schema.decodeSync(Group)

export const decodeGroupDetailSync = Schema.decodeSync(GroupDetail)

export const isoDate = (s: string) => DateTime.toDate(DateTime.makeUnsafe(s))

export const ticketId = Schema.decodeUnknownSync(TicketId)

export const ticketStatus = Schema.decodeUnknownSync(TicketStatus)

export const groupId = Schema.decodeUnknownSync(GroupId)

export const groupColor = Schema.decodeUnknownSync(GroupColor)

export const projectKey = Schema.decodeUnknownSync(ProjectKey)

export const userId = Schema.decodeUnknownSync(UserId)

export const githubIntegration = {
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

export const ticketIndexProject = {
  orgSlug: "org",
  organizationId: "org-1",
  projectId: "project-1",
  projectSlug: "p"
} satisfies TicketIndexProject

export function unexpected(method: string): Effect.Effect<never> {
  return Effect.die(new Error(`unexpected ${method} call`))
}

export function makeTicketDocument(
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

export function makeFakeTicketDocs(initialIds: ReadonlyArray<string>) {
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

export function makeFakeProjects(
  key: string,
  overrides: Partial<ProjectsShape> = {}
) {
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

export const scopeIn = (orgSlug: string, slug: string) =>
  projectScope("member", "developer", {
    orgSlug,
    slug,
    projectId: slug,
    organizationId: orgSlug
  })

export const defaultScope = scopeIn("org", "p")

export const testInfra = (scope = defaultScope) =>
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

export const FakeDb = databaseLayer(({ sql }) =>
  Effect.sync(() => {
    if (sql.includes('from "project_status"'))
      return [["todo"], ["in_progress"], ["done"]]
    if (sql.includes('from "project_index"')) return [["points"]]
    throw new Error(`Unexpected SQL: ${sql}`)
  })
)

export const makeFakeGroups = (overrides: Partial<GroupsShape> = {}) =>
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

export const FakeGroups = makeFakeGroups()

export const makeFakeAttachments = (
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

export const makeFakeFigmaLinks = (
  overrides: Partial<FigmaLinksShape> = {}
): Layer.Layer<FigmaLinks> =>
  Layer.succeed(FigmaLinks, {
    reconcileTicket: () => Effect.void,
    listForTicket: () => unexpected("FigmaLinks.listForTicket"),
    resolveThumbnailUrl: () => unexpected("FigmaLinks.resolveThumbnailUrl"),
    ...overrides
  } satisfies FigmaLinksShape)

export const makeRecordingFigmaLinks = () => {
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

export const makeRecordingAttachments = () => {
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

export const fakeUser = (id: string): User => ({
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

export const FakeUsers = Layer.succeed(Users, {
  findByEmail: () => unexpected("Users.findByEmail"),
  findManyByIds: () => unexpected("Users.findManyByIds"),
  fullByIds: (ids) => Effect.succeed(ids.map(fakeUser))
} satisfies UsersShape)

export const FakeComments = Layer.succeed(Comments, {
  list: () => unexpected("Comments.list"),
  create: () => unexpected("Comments.create"),
  importHistorical: () => unexpected("Comments.importHistorical"),
  edit: () => unexpected("Comments.edit"),
  remove: () => unexpected("Comments.remove")
} satisfies CommentsShape)

export const makeFakeGitHub = (overrides: Partial<GitHubShape> = {}) =>
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

export const entryFromDocument = (document: TicketDocument) => {
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

export const priorityOrdinal = { high: 3, med: 2, low: 1 } as const

export const ticketSortValue = (
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

export const matchingDocuments = (
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

export const decodeStatusSlug = Schema.decodeSync(StatusSlug)

export const querySectionsVia =
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

export type FakeTicketIndexShape = TicketIndexShape &
  TicketBranchIndex.TicketBranchIndex["Service"]

export const makeFakeTicketIndex = (
  documents: Map<string, TicketDocument>,
  overrides: Partial<FakeTicketIndexShape> = {}
) => {
  let nextTicketNumber =
    Math.max(
      0,
      ...[...documents.keys()].map((id) =>
        Number(id.slice(id.lastIndexOf("-") + 1))
      )
    ) + 1
  const index: FakeTicketIndexShape = {
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
  return Layer.mergeAll(
    Layer.succeed(TicketIndex, index),
    Layer.succeed(TicketBranchIndex.TicketBranchIndex, index)
  )
}

export const makeRecordingTicketIndex = (
  documents: Map<string, TicketDocument>
) => {
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

export const PassthroughLibrary = Layer.mock(Library, {
  resolveSynced: (_orgSlug, _slug, body) => Effect.succeed(body)
})

export type TicketsLayerOptions = Readonly<{
  projectDocs?: Layer.Layer<ProjectDocs>
  projects?: Layer.Layer<Projects>
  groups?: Layer.Layer<Groups>
  github?: Layer.Layer<GitHub>
  ticketIndex?: Layer.Layer<TicketIndex | TicketBranchIndex.TicketBranchIndex>
  attachments?: Layer.Layer<Attachments>
  figmaLinks?: Layer.Layer<FigmaLinks>
  scope?: ProjectScopeShape
  gitAutomation?: GitAutomationConfig
}>

export function makeTicketsLayer(
  key: string,
  ticketDocsLayer: Layer.Layer<TicketDocs>,
  options: TicketsLayerOptions = {}
) {
  return TicketServices.layer.pipe(
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

export function makeTicketsFixture(
  key: string,
  initialIds: ReadonlyArray<string>
) {
  const docs = makeFakeTicketDocs(initialIds)
  return {
    documents: docs.documents,
    layer: makeTicketsLayer(key, docs.layer, {
      ticketIndex: makeFakeTicketIndex(docs.documents)
    })
  }
}

export const scopeAs = (
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

export const permissionFixture = () => {
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

export const as = (scope: ProjectScopeShape) =>
  Effect.provideService(ProjectScope, scope)
