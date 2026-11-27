import { TicketId, TicketListQuery, TicketListSource } from "@pp/shared"
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter
} from "@tanstack/react-router"
import * as Schema from "effect/Schema"
import { expect, it } from "vitest"

import { parseSearch, stringifySearch } from "@/lib/searchParams"

import { ticketHref } from "./ticketHref"
import { TicketDetailSearch, ticketSearchFromSource } from "./ticketSearch"

const decodeQuery = Schema.decodeUnknownSync(TicketListQuery)
const decodeId = Schema.decodeUnknownSync(TicketId)

it("builds the same link as the router", () => {
  const root = createRootRoute()
  const ticket = createRoute({
    getParentRoute: () => root,
    path: "/orgs/$orgSlug/projects/$slug/tickets/$id",
    validateSearch: Schema.toStandardSchemaV1(TicketDetailSearch)
  })
  const router = createRouter({
    routeTree: root.addChildren([ticket]),
    history: createMemoryHistory(),
    parseSearch,
    stringifySearch
  })
  const search = ticketSearchFromSource(
    TicketListSource.cases.sections.make({
      grouping: "sprint",
      query: decodeQuery({
        type: ["bug", "chore"],
        q: "a&b c"
      })
    })
  )
  const params = {
    orgSlug: "org",
    slug: "my project",
    id: decodeId("PP-1")
  }
  for (const each of [search, undefined])
    expect(ticketHref(params.orgSlug, params.slug, params.id, each)).toBe(
      router.buildLocation({
        to: "/orgs/$orgSlug/projects/$slug/tickets/$id",
        params,
        search: each ?? {}
      }).href
    )
})
