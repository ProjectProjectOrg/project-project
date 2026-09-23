import type {
  OrgTicketRow,
  Project,
  Ticket,
  TicketId,
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
}>

export type OrgTicketsValue = Readonly<{
  tickets: ReadonlyArray<OrgTicket>
  hasMore: boolean
}>

export type MyTicketBoardValue = Readonly<{
  columns: ReadonlyArray<PlacedColumn<OrgTicket>>
  hasMore: boolean
}>

type ScopedRequest = Readonly<{
  req: OrgTicketsRequest
  scopes: ReadonlyArray<string>
}>

const listensTo = ({ req, scopes }: ScopedRequest) => [
  ...scopes.map(Keys.ticketsIn),
  Keys.orgMembers(req.params.orgSlug)
]

const mineQuery = (scoped: ScopedRequest) =>
  Api.query("tickets", "mine", {
    params: scoped.req.params,
    query: {},
    timeToLive: "2 minutes",
    reactivityKeys: listensTo(scoped)
  })

const recentQuery = (scoped: ScopedRequest) =>
  Api.query("tickets", "recent", {
    params: scoped.req.params,
    timeToLive: "2 minutes",
    reactivityKeys: listensTo(scoped)
  })

const withProjects = (
  projects: ReadonlyArray<Project>,
  rows: ReadonlyArray<OrgTicketRow>
): ReadonlyArray<OrgTicket> => {
  const bySlug = new Map(projects.map((project) => [project.slug, project]))
  return rows.flatMap(({ projectSlug, ticket }) => {
    const project = bySlug.get(projectSlug)
    return project ? [{ project, ticket }] : []
  })
}

const acrossVisibleProjects = <A, E>(
  req: OrgTicketsRequest,
  query: (scoped: ScopedRequest) => Atom.Atom<AsyncResult.AsyncResult<A, E>>
) => {
  const projects = projectsFor(projectsRequest(req.params.orgSlug))
  let lastScoped: ScopedRequest | undefined
  return Atom.readable(
    (get) => {
      const visible = get(projects)
      return AsyncResult.flatMap(visible, (list) => {
        const scoped: ScopedRequest = {
          req,
          scopes: list.map((project) =>
            projectScope(req.params.orgSlug, project.slug)
          )
        }
        lastScoped = scoped
        return AsyncResult.all([visible, get(query(scoped))])
      })
    },
    (refresh) => {
      refresh(projects)
      if (lastScoped) refresh(query(lastScoped))
    }
  )
}

const myTicketsView = (req: OrgTicketsRequest) =>
  Atom.map(acrossVisibleProjects(req, mineQuery), (result) =>
    AsyncResult.map(
      result,
      ([projects, page]): OrgTicketsValue => ({
        tickets: withProjects(projects, page.items),
        hasMore: page.nextCursor !== null
      })
    )
  )

const recentTicketsView = (req: OrgTicketsRequest) =>
  Atom.map(acrossVisibleProjects(req, recentQuery), (result) =>
    AsyncResult.map(
      result,
      ([projects, rows]): OrgTicketsValue => ({
        tickets: withProjects(projects, rows),
        hasMore: false
      })
    )
  )

export const myTickets = Atom.family((req: OrgTicketsRequest) =>
  Atom.optimistic(myTicketsView(req))
)

export const recentTickets = Atom.family((req: OrgTicketsRequest) =>
  Atom.optimistic(recentTicketsView(req))
)

export type OrgTicketKey = Readonly<{
  req: OrgTicketsRequest
  projectSlug: string
  id: TicketId
}>

export const patchOrgTicket = (
  value: OrgTicketsValue,
  key: Readonly<{ projectSlug: string; id: TicketId }>,
  update: (ticket: Ticket) => Ticket
): OrgTicketsValue => ({
  ...value,
  tickets: value.tickets.map((item) =>
    item.project.slug === key.projectSlug && item.ticket.id === key.id
      ? { ...item, ticket: update(item.ticket) }
      : item
  )
})

const updateOrgTicket = (
  name: string,
  view: typeof myTickets,
  unsavedPatch: (key: OrgTicketKey) => Atom.Writable<UpdateTicketInput>
) =>
  Atom.family((key: OrgTicketKey) =>
    Atom.optimisticFn(view(key.req), {
      reducer: (current, patch: UpdateTicketInput) =>
        AsyncResult.map(current, (value) =>
          patchOrgTicket(value, key, (ticket) =>
            applyTicketPatch(ticket, patch)
          )
        ),
      fn: (set) =>
        Api.runtime.fn(
          Effect.fn(name)(function* (patch: UpdateTicketInput, get) {
            const unsaved = unsavedPatch(key)
            const payload: UpdateTicketInput = { ...get(unsaved), ...patch }
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
                patchOrgTicket(value, key, () => updated)
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

const unsavedMyTicketPatch = Atom.family((_key: OrgTicketKey) =>
  Atom.make<UpdateTicketInput>({}).pipe(Atom.setIdleTTL("2 minutes"))
)

const unsavedRecentTicketPatch = Atom.family((_key: OrgTicketKey) =>
  Atom.make<UpdateTicketInput>({}).pipe(Atom.setIdleTTL("2 minutes"))
)

export const updateMyTicket = updateOrgTicket(
  "updateMyTicket",
  myTickets,
  unsavedMyTicketPatch
)

export const updateRecentTicket = updateOrgTicket(
  "updateRecentTicket",
  recentTickets,
  unsavedRecentTicketPatch
)

export const myTicketBoard = Atom.family((req: OrgTicketsRequest) =>
  Atom.readable(
    (get) => {
      const mine = get(myTickets(req))
      return AsyncResult.flatMap(mine, ({ tickets }) => {
        const slugs = [...new Set(tickets.map(({ project }) => project.slug))]
        return AsyncResult.map(
          AsyncResult.all([
            mine,
            AsyncResult.all(
              slugs.map((slug) =>
                AsyncResult.map(
                  get(statusesFor(statusesRequest(req.params.orgSlug, slug))),
                  (statuses) => ({ projectSlug: slug, statuses })
                )
              )
            )
          ]),
          ([value, projectStatuses]): MyTicketBoardValue => ({
            columns: placeInColumns(
              mergeStatusColumns(projectStatuses),
              value.tickets,
              ({ project, ticket }) => [project.slug, ticket.status]
            ),
            hasMore: value.hasMore
          })
        )
      })
    },
    (refresh) => refresh(myTickets(req))
  )
)

export type ProjectTicketGroup = Readonly<{
  project: Project
  tickets: ReadonlyArray<OrgTicket>
}>

export type MyTicketsByProjectValue = Readonly<{
  groups: ReadonlyArray<ProjectTicketGroup>
  hasMore: boolean
}>

export const groupByProject = (
  tickets: ReadonlyArray<OrgTicket>
): ReadonlyArray<ProjectTicketGroup> => {
  const groups = new Map<string, Array<OrgTicket>>()
  const projects = new Map<string, Project>()
  for (const item of tickets) {
    projects.set(item.project.slug, item.project)
    const group = groups.get(item.project.slug) ?? []
    group.push(item)
    groups.set(item.project.slug, group)
  }
  return [...groups]
    .map(([slug, items]) => ({ project: projects.get(slug)!, tickets: items }))
    .toSorted(
      (a, b) =>
        a.project.name.localeCompare(b.project.name, getLocale(), {
          sensitivity: "base"
        }) || a.project.slug.localeCompare(b.project.slug)
    )
}

export const myTicketsByProject = Atom.family((req: OrgTicketsRequest) =>
  Atom.map(myTickets(req), (result) =>
    AsyncResult.map(
      result,
      (value): MyTicketsByProjectValue => ({
        groups: groupByProject(value.tickets),
        hasMore: value.hasMore
      })
    )
  )
)
