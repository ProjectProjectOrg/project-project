import {
  mergeStatusColumns,
  OrgTicketPage,
  placeInColumns,
  Project,
  ProjectStatus,
  type StatusColumn,
  type Ticket
} from "@pp/shared"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"
import * as Atom from "effect/unstable/reactivity/Atom"

import { ServerAuth } from "@/auth/ServerAuth"
import { cacheSlot, ViewCache } from "@/cache/ViewCache"
import { orgKeys } from "@/orgs/atoms"
import { appRuntime } from "@/runtime"
import { serverKeys } from "@/servers/keys"
import type { OrgLocation } from "@/servers/model"

export type MyWorkTicket = Readonly<{ project: Project; ticket: Ticket }>

export type MyWorkSection = StatusColumn &
  Readonly<{ data: ReadonlyArray<MyWorkTicket> }>

export const myWorkKeys = {
  tickets: (location: OrgLocation) =>
    [`orgs:${location.instanceId}:${location.orgSlug}:my-work`] as const
}

const MyWorkSnapshot = Schema.Struct({
  page: OrgTicketPage,
  projects: Schema.Array(Project),
  statuses: Schema.Array(
    Schema.Struct({
      projectSlug: Schema.String,
      statuses: Schema.Array(ProjectStatus)
    })
  )
})
type MyWorkSnapshot = typeof MyWorkSnapshot.Type

const snapshotSlot = (orgSlug: string) =>
  cacheSlot(`my-work:${orgSlug}`, MyWorkSnapshot)

const fetchSnapshot = Effect.fn("fetchMyWork")(function* (
  location: OrgLocation
) {
  const auth = yield* ServerAuth
  const api = yield* auth.api(location.instanceId)
  const params = { orgSlug: location.orgSlug }
  const [page, projects] = yield* Effect.all(
    [api.tickets.mine({ params, query: {} }), api.projects.list({ params })],
    { concurrency: "unbounded" }
  )
  const involved = new Set(page.items.map(({ projectSlug }) => projectSlug))
  const statuses = yield* Effect.forEach(
    projects.filter((project) => involved.has(project.slug)),
    (project) =>
      api.statuses
        .list({ params: { ...params, slug: project.slug } })
        .pipe(
          Effect.map((list) => ({ projectSlug: project.slug, statuses: list }))
        ),
    { concurrency: "unbounded" }
  )
  return { page, projects, statuses } satisfies MyWorkSnapshot
})

const myWorkView = ({ page, projects, statuses }: MyWorkSnapshot) => {
  const bySlug = new Map(projects.map((project) => [project.slug, project]))
  const tickets = page.items.flatMap(({ projectSlug, ticket }) => {
    const project = bySlug.get(projectSlug)
    return project === undefined ? [] : [{ project, ticket }]
  })
  const sections = placeInColumns(
    mergeStatusColumns(statuses),
    tickets,
    ({ project, ticket }) => [project.slug, ticket.status]
  ).flatMap(({ items, ...column }) =>
    items.length === 0 ? [] : [{ ...column, data: items }]
  )
  return {
    total: page.total,
    projectCount: new Set(tickets.map(({ project }) => project.slug)).size,
    sections
  }
}

export const myWork = Atom.family((location: OrgLocation) =>
  appRuntime
    .atom(
      Stream.unwrap(
        Effect.gen(function* () {
          const cache = yield* ViewCache
          const slot = snapshotSlot(location.orgSlug)
          const cached = yield* cache.read(location.instanceId, slot)
          const fresh = fetchSnapshot(location).pipe(
            Effect.tap((snapshot) =>
              cache.write(location.instanceId, slot, snapshot)
            )
          )
          return Stream.concat(
            Stream.fromIterable(Option.toArray(cached)),
            Stream.fromEffect(fresh)
          )
        })
      ).pipe(Stream.map(myWorkView))
    )
    .pipe(
      Atom.withReactivity([
        ...myWorkKeys.tickets(location),
        ...orgKeys.projects(location),
        ...serverKeys.session(location.instanceId)
      ])
    )
)
