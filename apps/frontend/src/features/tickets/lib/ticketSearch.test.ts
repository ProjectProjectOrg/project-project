import { TicketListQuery, TicketViewSource } from "@pp/shared"
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter
} from "@tanstack/react-router"
import * as Schema from "effect/Schema"
import { expect, it } from "vitest"

import { parseSearch, stringifySearch } from "@/lib/searchParams"

import {
  BacklogSearch,
  SprintSearch,
  TicketDetailSearch,
  ticketQueryFromSearch,
  ticketSearchFromQuery,
  ticketSearchFromSource,
  ticketSourceFromSearch
} from "./ticketSearch"

const decodeQuery = Schema.decodeUnknownSync(TicketListQuery)
const decodeSource = Schema.decodeUnknownSync(TicketViewSource)
const decodeBacklog = Schema.decodeUnknownSync(BacklogSearch)
const decodeSprint = Schema.decodeUnknownSync(SprintSearch)
const decodeTicket = Schema.decodeUnknownSync(TicketDetailSearch)

it("converts all filter fields at the domain boundary while route state stays URL-shaped", () => {
  const query = decodeQuery({
    status: ["todo"],
    type: ["bug", "chore"],
    assignee: ["mine", "user,one"],
    tags: ["urgent", "component:api"],
    groupId: ["ungrouped", "G-1"],
    estimate: ["none", "stale"],
    parent: ["none", "PP-1"],
    hasBranch: true,
    hasPr: false,
    archived: false,
    blocked: true,
    updatedAfter: "2026-11-01T00:00:00.000Z",
    subTickets: "nested",
    q: "123",
    sort: { key: "priority", dir: "asc" }
  })
  const url = stringifySearch(ticketSearchFromQuery(query))
  expect(url).toContain("type=bug&type=chore")
  expect(url).toContain("sort=priority&dir=asc")
  const search = decodeBacklog(parseSearch(url))
  expect(search).toMatchObject({
    hasBranch: "true",
    hasPr: "false",
    updatedAfter: "2026-11-01T00:00:00.000Z",
    sort: "priority",
    dir: "asc"
  })
  expect(decodeBacklog(search)).toEqual(search)
  expect(decodeSprint(search)).toEqual(search)
  expect(ticketQueryFromSearch(search)).toEqual(query)
})

it("omits default sorting and restores it for the domain query", () => {
  expect(stringifySearch(ticketSearchFromQuery(decodeQuery({})))).toBe("")
  expect(ticketQueryFromSearch(decodeBacklog({})).sort).toEqual({
    key: "manual",
    dir: "asc"
  })
})

it.each([
  {
    source: {
      kind: "sections",
      grouping: "sprint",
      query: { type: ["bug", "chore"] }
    },
    expected: "?type=bug&type=chore&from=sections&group=sprint"
  },
  {
    source: {
      kind: "sprintBoard",
      groupId: "G-1",
      query: { groupId: ["G-2"], assignee: ["mine"] }
    },
    expected: "?assignee=mine&groupId=G-2&from=sprintBoard&sprint=G-1"
  }
])("preserves navigation context in $expected", ({ source, expected }) => {
  const from = decodeSource(source)
  const url = stringifySearch(ticketSearchFromSource(from))
  expect(url).toBe(expected)
  const search = decodeTicket(parseSearch(url))
  expect(decodeTicket(search)).toEqual(search)
  expect(ticketSourceFromSearch(search)).toEqual(from)
})

it.each([
  '{"kind":"sections","grouping":"sprint","query":{}}',
  '{"kind":',
  "unknown",
  "sections"
])(
  "drops unusable optional context while preserving ticket actions: %s",
  (from) => {
    const search = decodeTicket(
      parseSearch(
        `?${new URLSearchParams({ from, focusBody: "1" })}&splitInto=PP-2&splitInto=PP-3`
      )
    )
    expect(search).toEqual({
      focusBody: "1",
      splitInto: ["PP-2", "PP-3"],
      from: undefined
    })
    expect(ticketSourceFromSearch(search)).toBeUndefined()
  }
)

it.each([
  "?type=Not%20a%20key",
  "?sort=invalid",
  "?hasPr=invalid",
  "?updatedAfter=invalid"
])("rejects invalid list filters: %s", (url) => {
  expect(() => decodeBacklog(parseSearch(url))).toThrow()
})

it("reads the old type value other in a URL as no type", () => {
  const search = decodeBacklog(
    parseSearch("?type=other&type=bug&excludeType=other")
  )
  expect(search).toMatchObject({
    type: ["none", "bug"],
    excludeType: ["none"]
  })
  expect(ticketQueryFromSearch(search)).toMatchObject({
    type: ["none", "bug"],
    excludeType: ["none"]
  })
})

it("drops malformed flat navigation context as a unit", () => {
  const search = decodeTicket(
    parseSearch("?from=sections&group=status&type=Not%20a%20key&focusBody=1")
  )
  expect(search).toEqual({ focusBody: "1", from: undefined })
  expect(ticketSourceFromSearch(search)).toBeUndefined()
})

it("keeps filters and context through router links, navigation and reloads", async () => {
  const root = createRootRoute()
  const list = createRoute({
    getParentRoute: () => root,
    path: "/orgs/$orgSlug/projects/$slug/",
    validateSearch: Schema.toStandardSchemaV1(BacklogSearch)
  })
  const ticket = createRoute({
    getParentRoute: () => root,
    path: "/orgs/$orgSlug/projects/$slug/tickets/$id",
    validateSearch: Schema.toStandardSchemaV1(TicketDetailSearch)
  })
  const router = createRouter({
    routeTree: root.addChildren([list, ticket]),
    history: createMemoryHistory({
      initialEntries: [
        "/orgs/org/projects/project?type=bug&type=chore&hasPr=false&updatedAfter=2026-11-01&sort=title&dir=asc"
      ]
    }),
    parseSearch,
    stringifySearch
  })
  await router.load()
  const query = ticketQueryFromSearch(
    decodeBacklog(router.state.matches.at(-1)?.search)
  )
  const search = ticketSearchFromSource({
    kind: "sections",
    grouping: "status",
    query
  })
  const params = { orgSlug: "org", slug: "project", id: "PP-1" }
  const location = router.buildLocation({
    to: "/orgs/$orgSlug/projects/$slug/tickets/$id",
    params,
    search
  })
  expect(location.href).toContain("type=bug&type=chore")
  expect(location.href).toContain("from=sections&group=status")
  await router.navigate({
    to: "/orgs/$orgSlug/projects/$slug/tickets/$id",
    params,
    search
  })
  await router.navigate({
    to: "/orgs/$orgSlug/projects/$slug/tickets/$id",
    params: { ...params, id: "PP-2" },
    search,
    replace: true
  })
  await router.load()
  expect(router.state.location.pathname).toBe(
    "/orgs/org/projects/project/tickets/PP-2"
  )
  expect(
    ticketSourceFromSearch(decodeTicket(router.state.matches.at(-1)?.search))
  ).toEqual({ kind: "sections", grouping: "status", query })
  const split = router.buildLocation({
    to: "/orgs/$orgSlug/projects/$slug/tickets/$id",
    params,
    search: { focusBody: "1", splitInto: ["PP-2", "PP-3"] }
  })
  expect(split.href).toBe(
    "/orgs/org/projects/project/tickets/PP-1?focusBody=1&splitInto=PP-2&splitInto=PP-3"
  )
  await router.navigate({
    href: "/orgs/org/projects/project/tickets/PP-1?from=%7B%22kind%22%3A%22removed%22%7D"
  })
  expect(router.state.matches.at(-1)?.status).toBe("success")
  expect(router.state.matches.at(-1)?.search).toEqual({ from: undefined })
})
