import { EPIC_TYPE } from "@pp/shared"
import type { TicketListQuery, TicketSort } from "@pp/shared"
import * as Atom from "effect/reactivity/Atom"

import { Keys, projectScope } from "@/api/keys"
import { query } from "@/api/query"
import { localTicketList } from "@/features/local/atoms/localViews"
import { readLocal } from "@/features/local/atoms/readLocal"

import { allPages } from "./allPages"

export type EpicsRequest = Readonly<{
  params: Readonly<{ orgSlug: string; slug: string }>
}>

export const epicsRequest = (orgSlug: string, slug: string): EpicsRequest => ({
  params: { orgSlug, slug }
})

const EPIC_SORT: TicketSort = { key: "title", dir: "asc" }

const EPICS_QUERY: TicketListQuery = {
  type: [EPIC_TYPE],
  archived: false,
  sort: EPIC_SORT
}

const epicsPage = (req: EpicsRequest, cursor: string | undefined) =>
  query("tickets", "list", {
    params: req.params,
    query: { ...EPICS_QUERY, cursor },
    timeToLive: "2 minutes",
    reactivityKeys: [
      Keys.ticketsIn(projectScope(req.params.orgSlug, req.params.slug))
    ]
  })

const epicRows = (req: EpicsRequest) =>
  Atom.readable(
    (get) =>
      readLocal(get, req.params, () =>
        localTicketList({ params: req.params, query: EPICS_QUERY })
      ) ?? allPages(get, (cursor) => epicsPage(req, cursor)),
    (refresh) => refresh(epicsPage(req, undefined))
  )

export const projectEpics = Atom.family((req: EpicsRequest) =>
  Atom.mapResult(epicRows(req), (rows) => rows.map((row) => row.ticket))
)
