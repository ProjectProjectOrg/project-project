import type { TicketId, TicketListRow, TicketSort } from "@pp/shared"
import * as Atom from "effect/reactivity/Atom"

import { Keys, projectScope } from "@/api/keys"
import { query } from "@/api/query"

import { allPages } from "./allPages"

export type EpicsRequest = Readonly<{
  params: Readonly<{ orgSlug: string; slug: string }>
}>

export const epicsRequest = (orgSlug: string, slug: string): EpicsRequest => ({
  params: { orgSlug, slug }
})

const EPIC_SORT: TicketSort = { key: "title", dir: "asc" }

const epicsPage = (
  req: EpicsRequest,
  archived: boolean,
  cursor: string | undefined
) =>
  query("tickets", "list", {
    params: req.params,
    query: {
      type: ["epic"],
      archived,
      sort: EPIC_SORT,
      cursor
    },
    timeToLive: "2 minutes",
    reactivityKeys: [
      Keys.ticketsIn(projectScope(req.params.orgSlug, req.params.slug))
    ]
  })

const epicRows = (req: EpicsRequest, archived: boolean) =>
  Atom.readable(
    (get) => allPages(get, (cursor) => epicsPage(req, archived, cursor)),
    (refresh) => refresh(epicsPage(req, archived, undefined))
  )

export const projectEpics = Atom.family((req: EpicsRequest) =>
  Atom.mapResult(epicRows(req, false), (rows) => rows.map((row) => row.ticket))
)

const titlesOf = (
  rows: ReadonlyArray<TicketListRow>
): ReadonlyMap<TicketId, string> =>
  new Map(rows.map(({ ticket }) => [ticket.id, ticket.title]))

export const openEpicTitles = Atom.family((req: EpicsRequest) =>
  Atom.mapResult(epicRows(req, false), titlesOf)
)

export const archivedEpicTitles = Atom.family((req: EpicsRequest) =>
  Atom.mapResult(epicRows(req, true), titlesOf)
)
