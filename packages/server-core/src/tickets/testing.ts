import {
  ActivityActor,
  EPIC_SECTION_NONE,
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
  TicketRank,
  TicketStatus,
  UserId,
  tryDecodeCursor,
  type TicketCountQuery,
  type TicketFilter,
  type TicketListQuery,
  type User,
  ProjectScope,
  StatusSlug,
  Validation,
  BUILTIN_TYPE_KEYS,
  isBuiltinTypeKey,
  isEpic
} from "@pp/shared"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"

import { databaseLayer } from "../../test/database"
import { accessLayer, projectScope } from "../access/testing"
import { passthroughTicketActivity } from "../activity/testing"
import * as Attachments from "../attachments/Attachments"
import * as Comments from "../comments/Comments"
import * as FigmaLinks from "../figma/FigmaLinks"
import type { GitAutomationConfig } from "../git/automation"
import { gitAutomationTestLayer } from "../git/automationTesting"
import * as TicketBranchIndex from "../git/TicketBranchIndex"
import * as GitHub from "../github/GitHub"
import * as ProjectGithub from "../github/ProjectGithub"
import * as Groups from "../groups/Groups"
import * as Library from "../library/Library"
import * as Markdown from "../markdown/Markdown"
import { FinishedStatuses } from "../projects/FinishedStatuses"
import * as ProjectDocs from "../projects/ProjectDocs"
import * as ProjectMembers from "../projects/ProjectMembers"
import * as Projects from "../projects/Projects"
import * as Users from "../users/Users"
import * as TicketServices from "./layer"
import * as TicketDocs from "./TicketDocs"
import * as TicketDocumentLock from "./ticketDocumentLock"
import * as TicketIndex from "./TicketIndex"
import type { TicketProject } from "./ticketProject"
import {
  relationsFromRows,
  type RelationEdge,
  type RelationRow
} from "./ticketRelations"
import * as TicketRewrites from "./TicketRewrites"

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
  defaultBaseBranch: "main",
  isDefault: true
} satisfies ProjectGithub.ProjectGithubIntegration

export const secondGithubIntegration = {
  ...githubIntegration,
  projectIntegrationLinkId: "link-2",
  repoId: "repo-2",
  repoName: "api",
  isDefault: false
} satisfies ProjectGithub.ProjectGithubIntegration

export const ticketIndexProject = {
  orgSlug: "org",
  organizationId: "org-1",
  projectId: "project-1",
  slug: "p"
} satisfies TicketProject

export function unexpected(method: string): Effect.Effect<never> {
  return Effect.die(new Error(`unexpected ${method} call`))
}

export function makeTicketDocument(
  id: string,
  overrides: Partial<TicketDocs.TicketDocument> = {}
): TicketDocs.TicketDocument {
  const now = isoDate("2026-04-01T00:00:00.000Z")
  return {
    id: ticketId(id),
    title: id,
    status: ticketStatus("todo"),
    type: null,
    priority: "med",
    rank: TicketRank.make("a0"),
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
  const documents = new Map<string, TicketDocs.TicketDocument>(
    initialIds.map((id) => [id, makeTicketDocument(id)])
  )

  const service: TicketDocs.TicketDocs["Service"] = {
    listIds: () =>
      Effect.succeed([...documents.keys()].map((id) => ticketId(id))),
    read: (_org: string, _slug: string, id: string) => {
      const document = documents.get(id)
      return document ? Effect.succeed(document) : Effect.fail(new NotFound())
    },
    create: (
      _org: string,
      _slug: string,
      document: TicketDocs.TicketDocument,
      onPersist
    ) => {
      if (documents.has(document.id))
        return Effect.fail(new Markdown.TicketIdTaken())
      documents.set(document.id, document)
      return onPersist ? onPersist(document) : Effect.void
    },
    write: (
      _org: string,
      _slug: string,
      id: string,
      document: TicketDocs.TicketDocument
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
    layer: Layer.succeed(TicketDocs.TicketDocs, service)
  }
}

export function makeFakeProjects(
  key: string,
  overrides: Partial<Projects.Projects["Service"]> = {}
) {
  const service = {
    list: () => unexpected("Projects.list"),
    listPaged: () => unexpected("Projects.listPaged"),
    create: () => unexpected("Projects.create"),
    get: () => unexpected("Projects.get"),
    key: () => Effect.succeed(projectKey(key)),
    update: () => unexpected("Projects.update"),
    updateSetup: () => unexpected("Projects.updateSetup"),
    remove: () => unexpected("Projects.remove"),
    ...overrides
  } satisfies Projects.Projects["Service"]

  return Layer.succeed(Projects.Projects, service)
}

export const makeFakeProjectMembers = (
  overrides: Partial<ProjectMembers.ProjectMembers["Service"]> = {}
) =>
  Layer.succeed(ProjectMembers.ProjectMembers, {
    memberIds: () => Effect.succeed(new Set(["user-1", "user-2"])),
    listMembersPaged: () => unexpected("ProjectMembers.listMembersPaged"),
    addMember: () => unexpected("ProjectMembers.addMember"),
    updateMember: () => unexpected("ProjectMembers.updateMember"),
    removeMember: () => unexpected("ProjectMembers.removeMember"),
    leave: () => unexpected("ProjectMembers.leave"),
    cancelPendingMember: () => unexpected("ProjectMembers.cancelPendingMember"),
    ...overrides
  })

export const makeFakeProjectGithub = (
  overrides: Partial<ProjectGithub.ProjectGithub["Service"]> = {}
) => {
  const integrations: ProjectGithub.ProjectGithub["Service"]["integrations"] =
    overrides.integrations ??
    (() =>
      (overrides.integration?.() ?? Effect.succeed(null)).pipe(
        Effect.map((integration) => (integration === null ? [] : [integration]))
      ))
  return Layer.succeed(ProjectGithub.ProjectGithub, {
    integration: () =>
      integrations().pipe(
        Effect.map((connected) =>
          ProjectGithub.integrationForRepo(connected, null)
        )
      ),
    branches: () => unexpected("ProjectGithub.branches"),
    installations: () => unexpected("ProjectGithub.installations"),
    repos: () => unexpected("ProjectGithub.repos"),
    connect: () => unexpected("ProjectGithub.connect"),
    disconnect: () => unexpected("ProjectGithub.disconnect"),
    ...overrides,
    integrations
  })
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
    Layer.mock(ProjectDocs.ProjectDocs, {
      read: (_org, slug) =>
        Effect.succeed({
          slug,
          name: slug,
          icon: "folder",
          color: "#3b82f6",
          createdAt: isoDate("2026-01-01T00:00:00Z"),
          github: null,
          githubRepos: [],
          estimation: "points",
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

export const makeFakeGroups = (
  overrides: Partial<Groups.Groups["Service"]> = {}
) =>
  Layer.succeed(Groups.Groups, {
    list: () => unexpected("Groups.list"),
    listPaged: () => unexpected("Groups.listPaged"),
    listSprintsPaged: () => unexpected("Groups.listSprintsPaged"),
    get: () => unexpected("Groups.get"),
    create: () => unexpected("Groups.create"),
    update: () => unexpected("Groups.update"),
    updateTickets: () => unexpected("Groups.updateTickets"),
    addTickets: () => unexpected("Groups.addTickets"),
    removeTickets: () => unexpected("Groups.removeTickets"),
    complete: () => unexpected("Groups.complete"),
    remove: () => unexpected("Groups.remove"),
    ensureSprintAssignable: () => Effect.void,
    setSprintMembership: () => Effect.void,
    removeTicketFromAllGroups: () => Effect.void,
    ...overrides
  } satisfies Groups.Groups["Service"])

export const FakeGroups = makeFakeGroups()

export const makeFakeAttachments = (
  overrides: Partial<Attachments.Attachments["Service"]> = {}
): Layer.Layer<Attachments.Attachments> =>
  Layer.succeed(Attachments.Attachments, {
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
  } satisfies Attachments.Attachments["Service"])

export const makeFakeFigmaLinks = (
  overrides: Partial<FigmaLinks.FigmaLinks["Service"]> = {}
): Layer.Layer<FigmaLinks.FigmaLinks> =>
  Layer.succeed(FigmaLinks.FigmaLinks, {
    reconcileTicket: () => Effect.void,
    listForTicket: () => unexpected("FigmaLinks.listForTicket"),
    resolveThumbnailUrl: () => unexpected("FigmaLinks.resolveThumbnailUrl"),
    ...overrides
  } satisfies FigmaLinks.FigmaLinks["Service"])

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

export const FakeUsers = Layer.succeed(Users.Users, {
  findByEmail: () => unexpected("Users.findByEmail"),
  findManyByIds: (ids) => Effect.succeed(ids.map(fakeUser)),
  fullByIds: (ids) => Effect.succeed(ids.map(fakeUser))
} satisfies Users.Users["Service"])

export const FakeComments = Layer.succeed(Comments.Comments, {
  list: () => unexpected("Comments.list"),
  create: () => unexpected("Comments.create"),
  importHistorical: () => unexpected("Comments.importHistorical"),
  edit: () => unexpected("Comments.edit"),
  remove: () => unexpected("Comments.remove")
} satisfies Comments.Comments["Service"])

export const makeFakeGitHub = (
  overrides: Partial<GitHub.GitHub["Service"]> = {}
) =>
  Layer.succeed(GitHub.GitHub, {
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
  } satisfies GitHub.GitHub["Service"])

export const entryFromDocument = (
  document: TicketDocs.TicketDocument,
  parentOf: (id: string) => TicketDocs.TicketDocument | undefined = () =>
    undefined
) => {
  const {
    body: _body,
    commentsRegion: _commentsRegion,
    repo,
    ...entry
  } = document
  const parent = entry.parent === undefined ? undefined : parentOf(entry.parent)
  return {
    ...entry,
    repoId: entry.branch === null ? null : (repo ?? null),
    estimate: entry.estimate ?? null,
    flag: entry.flag ?? null,
    parent:
      parent === undefined
        ? null
        : { id: parent.id, title: parent.title, type: parent.type },
    subTicketCount: 0,
    subTicketDoneCount: 0,
    openBlockerCount: 0,
    openBlockingCount: 0,
    relatedCount: 0,
    duplicateCount: 0,
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
  document: TicketDocs.TicketDocument,
  query: TicketListQuery
): string => {
  switch (query.sort.key) {
    case "manual":
      return document.rank
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
  documents: Map<string, TicketDocs.TicketDocument>,
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
        {
          ...document,
          estimate: document.estimate ?? null,
          parent: document.parent ? { id: document.parent } : null
        },
        query,
        userId(viewerId),
        "points"
      )
  )
}

export const decodeStatusSlug = Schema.decodeSync(StatusSlug)

export const querySectionsVia =
  (
    index: Pick<TicketIndex.TicketIndex["Service"], "list" | "query" | "count">
  ): TicketIndex.TicketIndex["Service"]["querySections"] =>
  (project, query, options) =>
    Effect.gen(function* () {
      const out = new Map<
        string,
        {
          counts: { total: number; byStatus: Readonly<Record<string, number>> }
          entries: ReadonlyArray<TicketIndex.TicketIndexQueryEntry>
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
      if (
        options.sections === "parent" ||
        options.sections === "ticketParent"
      ) {
        const all = yield* index.list(project)
        const byId = new Map(all.map((entry) => [entry.id, entry]))
        const byEpic = options.sections === "parent"
        const sectionOf = (entry: TicketIndex.TicketIndexEntry): string => {
          const parent =
            entry.parent === null ? undefined : byId.get(entry.parent.id)
          if (parent === undefined) return EPIC_SECTION_NONE
          if (!byEpic) {
            return isEpic(parent) ? EPIC_SECTION_NONE : parent.id
          }
          return isEpic(parent)
            ? parent.id
            : (parent.parent?.id ?? EPIC_SECTION_NONE)
        }
        for (const key of new Set(all.map(sectionOf))) {
          const scoped = {
            ...options,
            ticketIds: all
              .filter((entry) => sectionOf(entry) === key)
              .map((entry) => entry.id)
          }
          const counts = yield* index.count(project, countQuery, scoped)
          const entries = yield* index.query(project, query, scoped)
          if (counts.total > 0) out.set(key, { counts, entries })
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

export const relationEdgesOfDocuments = (
  documents: Map<string, TicketDocs.TicketDocument>
): ReadonlyArray<RelationEdge> =>
  [...documents.values()].flatMap((document) =>
    TicketIndex.ticketRelationRowsFor(
      { orgSlug: "", organizationId: "", projectId: "", slug: "" },
      document
    ).map((row) => ({
      from: document.id,
      to: ticketId(row.toTicketId),
      kind: row.kind
    }))
  )

export const relationsOfDocuments = (
  documents: Map<string, TicketDocs.TicketDocument>,
  ticketId: string
) =>
  relationsFromRows(
    relationEdgesOfDocuments(documents).flatMap((edge): Array<RelationRow> => {
      const direction =
        edge.from === ticketId ? "out" : edge.to === ticketId ? "in" : null
      if (direction === null) return []
      const other = documents.get(direction === "out" ? edge.to : edge.from)
      if (other === undefined) return []
      return [
        {
          direction,
          kind: edge.kind,
          other: {
            id: other.id,
            title: other.title,
            status: other.status,
            archivedAt: other.archivedAt
          }
        }
      ]
    })
  )

const inRepository = (
  document: TicketDocs.TicketDocument,
  repository: TicketBranchIndex.BranchRepository
) =>
  document.repo === undefined
    ? repository.isDefault
    : document.repo === repository.repoId

export const fakeRanks = (
  documents: ReadonlyMap<string, TicketDocs.TicketDocument>
): Pick<TicketIndex.TicketIndex["Service"], "topRank" | "rankGap"> => ({
  topRank: () =>
    Effect.sync(
      () =>
        [...documents.values()]
          .map((document) => document.rank)
          .toSorted()[0] ?? null
    ),
  rankGap: (_project, anchorId, side, excludeId) =>
    Effect.sync(() => {
      const anchor = documents.get(anchorId)
      if (anchor === undefined) return null
      const others = [...documents.values()].flatMap((document) =>
        document.id === excludeId ? [] : [document.rank]
      )
      if (side === "after") {
        const upper =
          others.filter((rank) => rank > anchor.rank).toSorted()[0] ?? null
        return { lower: anchor.rank, upper }
      }
      const lower =
        others
          .filter((rank) => rank < anchor.rank)
          .toSorted()
          .at(-1) ?? null
      return { lower, upper: anchor.rank }
    })
})

export type FakeTicketIndexShape = TicketIndex.TicketIndex["Service"] &
  TicketBranchIndex.TicketBranchIndex["Service"]

export const makeFakeTicketIndex = (
  documents: Map<string, TicketDocs.TicketDocument>,
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
          .map((document) =>
            entryFromDocument(document, (id) => documents.get(id))
          )
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
            entry: entryFromDocument(document, (id) => documents.get(id)),
            sortValue,
            orderKey: `${sortValue}${TicketIndex.TICKET_ORDER_KEY_SEPARATOR}${document.id}`
          }
        })
      }),
    ...fakeRanks(documents),
    orderKeyFor: (_project, ticketId, sort) =>
      Effect.sync(() => {
        const document = documents.get(ticketId)
        if (document === undefined) return null
        const sortValue = ticketSortValue(document, { sort })
        return `${sortValue}${TicketIndex.TICKET_ORDER_KEY_SEPARATOR}${ticketId}`
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
    mentionableIds: (_project, ticketIds) =>
      Effect.sync(
        () => new Set(ticketIds.filter((ticketId) => documents.has(ticketId)))
      ),
    movedTo: () => Effect.succeed(null),
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
    findTicketsByBranch: (projectId, repository, branch) =>
      Effect.sync(() =>
        [...documents.values()].flatMap((document) =>
          document.branch === branch && inRepository(document, repository)
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
    findStackLayers: (projectId, repository, branch) =>
      Effect.sync(() =>
        [...documents.values()].flatMap((document) =>
          inRepository(document, repository) &&
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
    isRepositoryBranchAttached: (repoId, branch, stackedOnly) =>
      Effect.sync(() =>
        [...documents.values()].some(
          (document) =>
            (document.repo === undefined || document.repo === repoId) &&
            ((!stackedOnly && document.branch === branch) ||
              (document.stack ?? []).some((layer) => layer.branch === branch))
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
    querySections: (project, query, options) =>
      querySectionsVia(index)(project, query, options),
    neighbors: () => Effect.die(new Error("unexpected TicketIndex.neighbors")),
    parentOf: (_project, ticketId) =>
      Effect.sync(() => {
        const parent = documents.get(ticketId)
        return parent
          ? { id: parent.id, title: parent.title, type: parent.type }
          : null
      }),
    relationsOf: (_project, ticketId) =>
      Effect.sync(() => relationsOfDocuments(documents, ticketId)),
    relationEdges: () => Effect.sync(() => relationEdgesOfDocuments(documents)),
    ...overrides
  }
  return Layer.mergeAll(
    Layer.succeed(TicketIndex.TicketIndex, index),
    Layer.succeed(TicketBranchIndex.TicketBranchIndex, index)
  )
}

export const makeRecordingTicketIndex = (
  documents: Map<string, TicketDocs.TicketDocument>
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

export const PassthroughLibrary = Layer.mock(Library.Library, {
  resolveSynced: (_orgSlug, _slug, body) => Effect.succeed(body),
  typeKeys: () => Effect.succeed(new Set<string>(BUILTIN_TYPE_KEYS)),
  untouchedBodyCheck: () => Effect.succeed((body) => body.trim() === ""),
  expandForCreate: (_orgSlug, _slug, key) =>
    isBuiltinTypeKey(key)
      ? Effect.succeed({ body: "", priority: null, tags: [] })
      : Effect.fail(new Validation({ reason: `unknown_type:${key}` }))
})

export type TicketsLayerOptions = Readonly<{
  projectDocs?: Layer.Layer<ProjectDocs.ProjectDocs>
  projects?: Layer.Layer<Projects.Projects>
  projectGithub?: Layer.Layer<ProjectGithub.ProjectGithub>
  projectMembers?: Layer.Layer<ProjectMembers.ProjectMembers>
  groups?: Layer.Layer<Groups.Groups>
  github?: Layer.Layer<GitHub.GitHub>
  ticketIndex?: Layer.Layer<
    TicketIndex.TicketIndex | TicketBranchIndex.TicketBranchIndex
  >
  attachments?: Layer.Layer<Attachments.Attachments>
  figmaLinks?: Layer.Layer<FigmaLinks.FigmaLinks>
  scope?: ProjectScope["Service"]
  gitAutomation?: GitAutomationConfig
}>

export function makeTicketsLayer(
  key: string,
  ticketDocsLayer: Layer.Layer<TicketDocs.TicketDocs>,
  options: TicketsLayerOptions = {}
) {
  return Layer.merge(TicketServices.layer, TicketRewrites.layer).pipe(
    Layer.provide(gitAutomationTestLayer(options.gitAutomation)),
    Layer.provide(PassthroughLibrary),
    Layer.provide(passthroughTicketActivity),
    Layer.provide(ticketDocsLayer),
    Layer.provide(options.projectDocs ?? Layer.empty),
    Layer.provide(options.projects ?? makeFakeProjects(key)),
    Layer.provide(options.projectGithub ?? makeFakeProjectGithub()),
    Layer.provide(options.projectMembers ?? makeFakeProjectMembers()),
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
    projectMembers: makeFakeProjectMembers({
      memberIds: () => Effect.succeed(new Set(["user-1", "user-2", "client-1"]))
    }),
    projectGithub: makeFakeProjectGithub({
      integration: () => Effect.succeed(githubIntegration)
    })
  })
  return { docs, layer }
}

export const as = (scope: ProjectScope["Service"]) =>
  Effect.provideService(ProjectScope, scope)
