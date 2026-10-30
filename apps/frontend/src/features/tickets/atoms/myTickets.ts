import type {
  AssignedStatusCount,
  OrgTicketRow,
  Project,
  RecentTicketActivity,
  Ticket,
  TicketId
} from "@pp/shared"
import * as Effect from "effect/Effect"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import * as Atom from "effect/reactivity/Atom"

import { Api } from "@/api/Api"
import { Keys, projectScope } from "@/api/keys"
import { query } from "@/api/query"
import type { OptimisticView } from "@/api/viewMutation"
import {
  projectsFor,
  projectsRequest
} from "@/features/projects/atoms/projects"
import {
  statusesFor,
  statusesRequest
} from "@/features/projects/atoms/projectStatuses"
import {
  mergeStatusColumns,
  placeInColumns,
  type PlacedColumn
} from "@/features/statuses/lib/statusColumns"
import { getLocale } from "@/paraglide/runtime"

import { applyTicketPatch } from "../lib/ticketPatch"
import {
  coalescingTicketUpdate,
  loadNextPage,
  readLoadedPages,
  type TicketUpdateAtom,
  type TicketUpdates
} from "./ticketRows"

type OrgTicketsView = "myTickets" | "myTicketsByProject" | "recentTickets"

export type OrgTicketsRequest<View extends OrgTicketsView = OrgTicketsView> =
  Readonly<{
    _view: View
    params: Readonly<{ orgSlug: string }>
  }>

export type MyTicketsRequest = OrgTicketsRequest<"myTickets">
export type MyTicketsByProjectRequest = OrgTicketsRequest<"myTicketsByProject">
export type RecentTicketsRequest = OrgTicketsRequest<"recentTickets">

export const myTicketsRequest = (orgSlug: string): MyTicketsRequest => ({
  _view: "myTickets",
  params: { orgSlug }
})

export const myTicketsByProjectRequest = (
  orgSlug: string
): MyTicketsByProjectRequest => ({
  _view: "myTicketsByProject",
  params: { orgSlug }
})

export const recentTicketsRequest = (
  orgSlug: string
): RecentTicketsRequest => ({
  _view: "recentTickets",
  params: { orgSlug }
})

export type OrgTicket = Readonly<{
  project: Project
  ticket: Ticket
  activity: RecentTicketActivity | null
}>

export type OrgTicketsValue = Readonly<{
  tickets: ReadonlyArray<OrgTicket>
  nextCursor: string | null
  total: number
  statusCounts: ReadonlyArray<AssignedStatusCount>
}>

export type CountedColumn = PlacedColumn<OrgTicket> &
  Readonly<{ count: number }>

export type MyTicketBoardValue = Readonly<{
  columns: ReadonlyArray<CountedColumn>
  nextCursor: string | null
  total: number
}>

export type ProjectTicketGroup = Readonly<{
  project: Project
  total: number
  tickets: ReadonlyArray<OrgTicket>
}>

export type MyTicketsByProjectValue = Readonly<{
  groups: ReadonlyArray<ProjectTicketGroup>
}>

type ScopedRequest = Readonly<{
  req: OrgTicketsRequest
  scopes: ReadonlyArray<string>
}>

const scopedOf = (
  req: OrgTicketsRequest,
  projects: ReadonlyArray<Project>
): ScopedRequest => ({
  req,
  scopes: projects.map((project) =>
    projectScope(req.params.orgSlug, project.slug)
  )
})

const listensTo = ({ req, scopes }: ScopedRequest) => [
  ...scopes.map(Keys.ticketsIn),
  Keys.orgMembers(req.params.orgSlug)
]

const mineQuery = (scoped: ScopedRequest, cursor: string | undefined) =>
  query("tickets", "mine", {
    params: scoped.req.params,
    query: cursor === undefined ? {} : { cursor },
    timeToLive: "2 minutes",
    reactivityKeys: listensTo(scoped)
  })

const mineByProjectQuery = (scoped: ScopedRequest) =>
  query("tickets", "mineByProject", {
    params: scoped.req.params,
    timeToLive: "2 minutes",
    reactivityKeys: listensTo(scoped)
  })

const recentQuery = (scoped: ScopedRequest) =>
  query("tickets", "recent", {
    params: scoped.req.params,
    timeToLive: "2 minutes",
    reactivityKeys: [
      ...listensTo(scoped),
      ...scoped.scopes.map(Keys.ticketComments)
    ]
  })

const withProjects = (
  projects: ReadonlyArray<Project>,
  rows: ReadonlyArray<
    OrgTicketRow & Readonly<{ activity?: RecentTicketActivity }>
  >
): ReadonlyArray<OrgTicket> => {
  const bySlug = new Map(projects.map((project) => [project.slug, project]))
  return rows.flatMap(({ projectSlug, ticket, activity }) => {
    const project = bySlug.get(projectSlug)
    return project ? [{ project, ticket, activity: activity ?? null }] : []
  })
}

const dedupeRows = <Row extends OrgTicketRow>(
  rows: ReadonlyArray<Row>
): ReadonlyArray<Row> => {
  const seen = new Set<string>()
  return rows.filter((row) => {
    const id = `${row.projectSlug}/${row.ticket.id}`
    if (seen.has(id)) return false
    seen.add(id)
    return true
  })
}

const byProjectName = (a: Project, b: Project) =>
  a.name.localeCompare(b.name, getLocale(), { sensitivity: "base" }) ||
  a.slug.localeCompare(b.slug)

const visibleProjects = (req: OrgTicketsRequest) =>
  projectsFor(projectsRequest(req.params.orgSlug))

const loadedPages = Atom.family((_req: MyTicketsRequest) =>
  Atom.make(0).pipe(Atom.setIdleTTL("2 minutes"))
)

const myTicketsView = (req: MyTicketsRequest) => {
  let lastScoped: ScopedRequest | undefined
  return Atom.readable(
    (get) => {
      const visible = get(visibleProjects(req))
      return AsyncResult.flatMap(visible, (projects) => {
        const scoped = scopedOf(req, projects)
        lastScoped = scoped
        const first = get(mineQuery(scoped, undefined))
        return AsyncResult.flatMap(first, (firstPage) => {
          const pages = readLoadedPages(
            get,
            firstPage,
            get(loadedPages(req)),
            (cursor) => mineQuery(scoped, cursor)
          )
          return AsyncResult.success<OrgTicketsValue>(
            {
              tickets: withProjects(projects, dedupeRows(pages.items)),
              nextCursor: pages.nextCursor,
              total: firstPage.total,
              statusCounts: firstPage.statusCounts
            },
            { waiting: visible.waiting || first.waiting || pages.waiting }
          )
        })
      })
    },
    (refresh) => {
      refresh(visibleProjects(req))
      if (lastScoped) refresh(mineQuery(lastScoped, undefined))
    }
  )
}

const myTicketsByProjectView = (req: MyTicketsByProjectRequest) => {
  let lastScoped: ScopedRequest | undefined
  return Atom.readable(
    (get) => {
      const visible = get(visibleProjects(req))
      return AsyncResult.flatMap(visible, (projects) => {
        const scoped = scopedOf(req, projects)
        lastScoped = scoped
        const bySlug = new Map(
          projects.map((project) => [project.slug, project])
        )
        return AsyncResult.map(
          AsyncResult.all([visible, get(mineByProjectQuery(scoped))]),
          ([, previews]): MyTicketsByProjectValue => ({
            groups: previews
              .flatMap(({ projectSlug, total, tickets }) => {
                const project = bySlug.get(projectSlug)
                if (!project) return []
                return [
                  {
                    project,
                    total,
                    tickets: tickets.map((ticket) => ({
                      project,
                      ticket,
                      activity: null
                    }))
                  }
                ]
              })
              .toSorted((a, b) => byProjectName(a.project, b.project))
          })
        )
      })
    },
    (refresh) => {
      refresh(visibleProjects(req))
      if (lastScoped) refresh(mineByProjectQuery(lastScoped))
    }
  )
}

const recentTicketsView = (req: RecentTicketsRequest) => {
  let lastScoped: ScopedRequest | undefined
  return Atom.readable(
    (get) => {
      const visible = get(visibleProjects(req))
      return AsyncResult.flatMap(visible, (projects) => {
        const scoped = scopedOf(req, projects)
        lastScoped = scoped
        return AsyncResult.map(
          AsyncResult.all([visible, get(recentQuery(scoped))]),
          ([, rows]): OrgTicketsValue => {
            const tickets = withProjects(projects, rows)
            return {
              tickets,
              nextCursor: null,
              total: tickets.length,
              statusCounts: []
            }
          }
        )
      })
    },
    (refresh) => {
      refresh(visibleProjects(req))
      if (lastScoped) refresh(recentQuery(lastScoped))
    }
  )
}

export const myTickets = Atom.family((req: MyTicketsRequest) =>
  Atom.optimistic(myTicketsView(req))
)

export const myTicketsByProject = Atom.family(
  (req: MyTicketsByProjectRequest) =>
    Atom.optimistic(myTicketsByProjectView(req))
)

export const recentTickets = Atom.family((req: RecentTicketsRequest) =>
  Atom.optimistic(recentTicketsView(req))
)

export const loadMoreMyTickets = Atom.family((req: MyTicketsRequest) =>
  Api.runtime.fn(
    Effect.fn("loadMoreMyTickets")(function* (
      _input: void,
      get: Atom.FnContext
    ) {
      const current = get(myTickets(req))
      if (!AsyncResult.isSuccess(current) || !current.value.nextCursor)
        return yield* Effect.void
      const visible = get(visibleProjects(req))
      if (!AsyncResult.isSuccess(visible)) return yield* Effect.void
      const scoped = scopedOf(req, visible.value)
      return yield* loadNextPage(get, {
        visibleCursor: () => current.value.nextCursor,
        depth: () => get(loadedPages(req)),
        firstCursor: () => {
          const first = get(mineQuery(scoped, undefined))
          return AsyncResult.isSuccess(first)
            ? first.value.nextCursor
            : undefined
        },
        page: (cursor) => mineQuery(scoped, cursor),
        deepen: (depth) => get.set(loadedPages(req), depth)
      })
    })
  )
)

export type OrgTicketScope<R extends OrgTicketsRequest = OrgTicketsRequest> =
  Readonly<{
    req: R
    viewerId: string
    projectSlug: string
  }>

export type OrgTicketKey<R extends OrgTicketsRequest = OrgTicketsRequest> =
  OrgTicketScope<R> & Readonly<{ id: TicketId }>

export type OrgTicketUpdates = (
  scope: Readonly<{ viewerId: string; projectSlug: string }>
) => TicketUpdates

type TicketUpdate = (ticket: Ticket) => Ticket

type PatchView<V> = (value: V, key: OrgTicketKey, update: TicketUpdate) => V

const isKey = (item: OrgTicket, key: OrgTicketKey) =>
  item.project.slug === key.projectSlug && item.ticket.id === key.id

const patchTickets = (
  tickets: ReadonlyArray<OrgTicket>,
  key: OrgTicketKey,
  update: TicketUpdate,
  keeps: boolean | ((ticket: Ticket) => boolean)
): ReadonlyArray<OrgTicket> =>
  tickets.flatMap((item) => {
    if (!isKey(item, key)) return [item]
    const ticket = update(item.ticket)
    const kept = typeof keeps === "boolean" ? keeps : keeps(ticket)
    return kept ? [{ ...item, ticket }] : []
  })

const stillMine = (key: OrgTicketKey) => (ticket: Ticket) =>
  ticket.assignees.includes(key.viewerId)

const moveStatusCount = (
  counts: ReadonlyArray<AssignedStatusCount>,
  projectSlug: string,
  from: Ticket["status"],
  to: Ticket["status"] | null
): ReadonlyArray<AssignedStatusCount> => {
  if (from === to) return counts
  const adjusted = counts.map((entry) =>
    entry.projectSlug !== projectSlug
      ? entry
      : entry.status === from
        ? { ...entry, count: Math.max(0, entry.count - 1) }
        : entry.status === to
          ? { ...entry, count: entry.count + 1 }
          : entry
  )
  const hasTarget =
    to === null ||
    counts.some(
      (entry) => entry.projectSlug === projectSlug && entry.status === to
    )
  return hasTarget
    ? adjusted
    : [...adjusted, { projectSlug, status: to, count: 1 }]
}

const patchMine: PatchView<OrgTicketsValue> = (value, key, update) => {
  const before = value.tickets.find((item) => isKey(item, key))
  const tickets = patchTickets(value.tickets, key, update, stillMine(key))
  if (!before) return { ...value, tickets }
  const after = tickets.find((item) => isKey(item, key))
  return {
    ...value,
    tickets,
    total: after ? value.total : value.total - 1,
    statusCounts: moveStatusCount(
      value.statusCounts,
      key.projectSlug,
      before.ticket.status,
      after ? after.ticket.status : null
    )
  }
}

const patchRecent: PatchView<OrgTicketsValue> = (value, key, update) => ({
  ...value,
  tickets: patchTickets(value.tickets, key, update, true)
})

const patchByProject: PatchView<MyTicketsByProjectValue> = (
  value,
  key,
  update
) => ({
  groups: value.groups.map((group) => {
    if (group.project.slug !== key.projectSlug) return group
    const tickets = patchTickets(group.tickets, key, update, stillMine(key))
    const removed = group.tickets.length - tickets.length
    return { ...group, tickets, total: group.total - removed }
  })
})

const updateOrgTicket = <R extends OrgTicketsRequest, V, E>(
  name: string,
  view: (req: R) => OptimisticView<V, E>,
  patch: PatchView<V>
) =>
  Atom.family((key: OrgTicketKey<R>) =>
    coalescingTicketUpdate(view(key.req), {
      name,
      path: {
        orgSlug: key.req.params.orgSlug,
        slug: key.projectSlug,
        id: key.id
      },
      predict: (value, input) =>
        patch(value, key, (ticket) => applyTicketPatch(ticket, input)),
      confirm: (value, { ticket }) => patch(value, key, () => ticket)
    })
  )

export const updateMyTicket = updateOrgTicket(
  "updateMyTicket",
  myTickets,
  patchMine
)

export const updateProjectTicket = updateOrgTicket(
  "updateProjectTicket",
  myTicketsByProject,
  patchByProject
)

export const updateRecentTicket = updateOrgTicket(
  "updateRecentTicket",
  recentTickets,
  patchRecent
)

const bindOrgTicketUpdates = <R extends OrgTicketsRequest>(
  family: (key: OrgTicketKey<R>) => TicketUpdateAtom
) => {
  const rows = Atom.family(
    (scope: OrgTicketScope<R>): TicketUpdates =>
      (id) =>
        family({ ...scope, id })
  )
  return Atom.family(
    (req: R): OrgTicketUpdates =>
      ({ viewerId, projectSlug }) =>
        rows({ req, viewerId, projectSlug })
  )
}

export const myTicketUpdates = bindOrgTicketUpdates(updateMyTicket)

export const projectTicketUpdates = bindOrgTicketUpdates(updateProjectTicket)

export const recentTicketUpdates = bindOrgTicketUpdates(updateRecentTicket)

const statusesOf = (req: MyTicketsRequest, slug: string) =>
  statusesFor(statusesRequest(req.params.orgSlug, slug))

export const myTicketBoard = Atom.family((req: MyTicketsRequest) => {
  let lastSlugs: ReadonlyArray<string> = []
  return Atom.readable(
    (get) => {
      const mine = get(myTickets(req))
      return AsyncResult.flatMap(mine, ({ tickets }) => {
        const slugs = [...new Set(tickets.map(({ project }) => project.slug))]
        lastSlugs = slugs
        return AsyncResult.map(
          AsyncResult.all([
            mine,
            AsyncResult.all(
              slugs.map((slug) =>
                AsyncResult.map(get(statusesOf(req, slug)), (statuses) => ({
                  projectSlug: slug,
                  statuses
                }))
              )
            )
          ]),
          ([value, projectStatuses]): MyTicketBoardValue => {
            const merged = mergeStatusColumns(projectStatuses)
            const countByColumn = new Map<string, number>()
            for (const entry of value.statusCounts) {
              const column = merged.columnKeyFor(
                entry.projectSlug,
                entry.status
              )
              if (column === undefined) continue
              countByColumn.set(
                column,
                (countByColumn.get(column) ?? 0) + entry.count
              )
            }
            return {
              columns: placeInColumns(
                merged,
                value.tickets,
                ({ project, ticket }) => [project.slug, ticket.status]
              ).map((column) => ({
                ...column,
                count: Math.max(
                  countByColumn.get(column.key) ?? 0,
                  column.items.length
                )
              })),
              nextCursor: value.nextCursor,
              total: value.total
            }
          }
        )
      })
    },
    (refresh) => {
      refresh(myTickets(req))
      for (const slug of lastSlugs) refresh(statusesOf(req, slug))
    }
  )
})
