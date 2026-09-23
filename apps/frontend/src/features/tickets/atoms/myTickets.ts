import type {
  AssignedStatusCount,
  NotFound,
  OrgTicketRow,
  Project,
  RecentTicketActivity,
  Ticket,
  TicketId,
  Unauthorized,
  UpdateTicketInput
} from "@pp/shared"
import * as Cause from "effect/Cause"
import * as Effect from "effect/Effect"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import * as Atom from "effect/unstable/reactivity/Atom"
import * as Reactivity from "effect/unstable/reactivity/Reactivity"

import { Api } from "@/api/Api"
import { Keys, projectScope } from "@/api/keys"
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
} from "@/lib/statusColumns"
import { getLocale } from "@/paraglide/runtime"

import { applyTicketPatch } from "./ticketPatch"

export type OrgTicketsRequest = Readonly<{
  params: Readonly<{ orgSlug: string }>
}>

export const orgTicketsRequest = (orgSlug: string): OrgTicketsRequest => ({
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
  Api.query("tickets", "mine", {
    params: scoped.req.params,
    query: cursor === undefined ? {} : { cursor },
    timeToLive: "2 minutes",
    reactivityKeys: listensTo(scoped)
  })

const mineByProjectQuery = (scoped: ScopedRequest) =>
  Api.query("tickets", "mineByProject", {
    params: scoped.req.params,
    timeToLive: "2 minutes",
    reactivityKeys: listensTo(scoped)
  })

const recentQuery = (scoped: ScopedRequest) =>
  Api.query("tickets", "recent", {
    params: scoped.req.params,
    timeToLive: "2 minutes",
    reactivityKeys: [
      ...listensTo(scoped),
      ...scoped.scopes.map(Keys.ticketActivity)
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

const loadedPages = Atom.family((_req: OrgTicketsRequest) =>
  Atom.make(0).pipe(Atom.setIdleTTL("2 minutes"))
)

const myTicketsView = (req: OrgTicketsRequest) => {
  let lastScoped: ScopedRequest | undefined
  return Atom.readable(
    (get) => {
      const visible = get(visibleProjects(req))
      return AsyncResult.flatMap(visible, (projects) => {
        const scoped = scopedOf(req, projects)
        lastScoped = scoped
        const first = get(mineQuery(scoped, undefined))
        return AsyncResult.flatMap(first, (firstPage) => {
          const rows: Array<OrgTicketRow> = [...firstPage.items]
          const parts: Array<AsyncResult.AsyncResult<unknown, unknown>> = [
            visible,
            first
          ]
          let nextCursor = firstPage.nextCursor
          const depth = get(loadedPages(req))
          for (let index = 0; index < depth; index++) {
            if (nextCursor === null) break
            const page = get(mineQuery(scoped, nextCursor))
            parts.push(page)
            if (!AsyncResult.isSuccess(page)) break
            rows.push(...page.value.items)
            nextCursor = page.value.nextCursor
          }
          return AsyncResult.success<OrgTicketsValue>(
            {
              tickets: withProjects(projects, dedupeRows(rows)),
              nextCursor,
              total: firstPage.total,
              statusCounts: firstPage.statusCounts
            },
            { waiting: parts.some((part) => part.waiting) }
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

const myTicketsByProjectView = (req: OrgTicketsRequest) => {
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

const recentTicketsView = (req: OrgTicketsRequest) => {
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

export const myTickets = Atom.family((req: OrgTicketsRequest) =>
  Atom.optimistic(myTicketsView(req))
)

export const myTicketsByProject = Atom.family((req: OrgTicketsRequest) =>
  Atom.optimistic(myTicketsByProjectView(req))
)

export const recentTickets = Atom.family((req: OrgTicketsRequest) =>
  Atom.optimistic(recentTicketsView(req))
)

export const loadMoreMyTickets = Atom.family((req: OrgTicketsRequest) =>
  Api.runtime.fn(
    Effect.fn("loadMoreMyTickets")(function* (
      _input: void,
      get: Atom.FnContext
    ) {
      const current = get(myTickets(req))
      if (!AsyncResult.isSuccess(current)) return yield* Effect.void
      const cursor = current.value.nextCursor
      if (!cursor) return yield* Effect.void
      const visible = get(visibleProjects(req))
      if (!AsyncResult.isSuccess(visible)) return yield* Effect.void
      const scoped = scopedOf(req, visible.value)
      const first = get(mineQuery(scoped, undefined))
      if (!AsyncResult.isSuccess(first)) return yield* Effect.void
      const depth = get(loadedPages(req))
      let pageCursor: string | null = first.value.nextCursor
      for (let index = 0; index < depth; index++) {
        if (pageCursor === null) break
        const page = mineQuery(scoped, pageCursor)
        if (pageCursor === cursor) {
          return yield* Effect.callback<unknown, NotFound | Unauthorized>(
            (resume) => {
              let cancel: (() => void) | undefined
              cancel = get.registry.subscribe(
                page,
                (result) => {
                  if (AsyncResult.isSuccess(result) && !result.waiting) {
                    cancel?.()
                    resume(Effect.succeed(result.value))
                  } else if (AsyncResult.isFailure(result) && !result.waiting) {
                    cancel?.()
                    resume(Effect.failCause(result.cause))
                  }
                },
                { immediate: false }
              )
              get.refresh(page)
              return Effect.sync(() => cancel?.())
            }
          )
        }
        const result = get(page)
        if (!AsyncResult.isSuccess(result)) return yield* Effect.void
        pageCursor = result.value.nextCursor
      }
      get.set(loadedPages(req), depth + 1)
      return yield* get.result(mineQuery(scoped, cursor), {
        suspendOnWaiting: true
      })
    })
  )
)

export type OrgTicketKey = Readonly<{
  req: OrgTicketsRequest
  viewerId: string
  projectSlug: string
  id: TicketId
}>

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

type OptimisticView<V, E> = Atom.Writable<
  AsyncResult.AsyncResult<V, E>,
  Atom.Atom<AsyncResult.AsyncResult<AsyncResult.AsyncResult<V, E>, unknown>>
>

const updateOrgTicket = <V, E>(
  name: string,
  view: (req: OrgTicketsRequest) => OptimisticView<V, E>,
  patch: PatchView<V>
) => {
  const unsavedPatch = Atom.family((_key: OrgTicketKey) =>
    Atom.make<UpdateTicketInput>({}).pipe(Atom.setIdleTTL("2 minutes"))
  )
  return Atom.family((key: OrgTicketKey) =>
    Atom.optimisticFn(view(key.req), {
      reducer: (current, input: UpdateTicketInput) =>
        AsyncResult.map(current, (value) =>
          patch(value, key, (ticket) => applyTicketPatch(ticket, input))
        ),
      fn: (set) =>
        Api.runtime.fn(
          Effect.fn(name)(function* (input: UpdateTicketInput, get) {
            const unsaved = unsavedPatch(key)
            const payload: UpdateTicketInput = { ...get(unsaved), ...input }
            get.set(unsaved, payload)
            const { ticket: updated } = yield* Effect.catchCause(
              Api.use((client) =>
                client.tickets.update({
                  params: {
                    orgSlug: key.req.params.orgSlug,
                    slug: key.projectSlug,
                    id: key.id
                  },
                  query: {},
                  payload
                })
              ),
              (cause) => {
                if (
                  !Cause.hasInterruptsOnly(cause) &&
                  get(unsaved) === payload
                ) {
                  get.set(unsaved, {})
                }
                return Effect.failCause(cause)
              }
            )
            if (get(unsaved) === payload) get.set(unsaved, {})
            set(
              AsyncResult.map(get(view(key.req)), (value) =>
                patch(value, key, () => updated)
              )
            )
            const scope = projectScope(key.req.params.orgSlug, key.projectSlug)
            yield* Reactivity.invalidate([
              Keys.ticket(scope, key.id),
              Keys.ticketsIn(scope),
              Keys.ticketLists(scope),
              Keys.ticketPages(scope)
            ])
            return updated
          })
        )
    })
  )
}

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

const statusesOf = (req: OrgTicketsRequest, slug: string) =>
  statusesFor(statusesRequest(req.params.orgSlug, slug))

export const myTicketBoard = Atom.family((req: OrgTicketsRequest) => {
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
