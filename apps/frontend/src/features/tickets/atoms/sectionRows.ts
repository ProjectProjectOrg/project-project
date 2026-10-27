import {
  matchesTicketQuery,
  padNumericIdSort,
  type Ticket,
  type TicketCounts,
  type TicketId,
  type TicketListPage,
  type TicketListQuery,
  type TicketSort,
  type TicketStatus,
  type UpdateTicketInput,
  type UserId
} from "@pp/shared"
import * as Effect from "effect/Effect"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import type * as Atom from "effect/unstable/reactivity/Atom"

import { compareCodePoints } from "@/lib/orderKey"
import { PRIORITY_META } from "@/lib/priority-meta"

import type { BacklogRow, BacklogSection } from "./backlog"
import { applyTicketPatch } from "./ticketPatch"

export type SectionValue<K extends string> = Readonly<{
  key: K
  count: number
  page: BacklogSection
}>

export type SectionsValue<S extends SectionValue<string>> = Readonly<{
  total: number
  counts: TicketCounts
  sections: ReadonlyArray<S>
}>

export const dedupeById = (
  rows: ReadonlyArray<BacklogRow>
): ReadonlyArray<BacklogRow> => {
  const seen = new Set<string>()
  const out: Array<BacklogRow> = []
  for (const row of rows) {
    if (seen.has(row.ticket.id)) continue
    seen.add(row.ticket.id)
    out.push(row)
  }
  return out
}

export const insertByOrderKey = (
  items: ReadonlyArray<BacklogRow>,
  row: BacklogRow,
  dir: TicketSort["dir"]
): ReadonlyArray<BacklogRow> => {
  const orderKey = row.orderKey
  if (orderKey === null) return [row, ...items]
  let low = 0
  let high = items.length
  while (low < high) {
    const middle = (low + high) >>> 1
    const candidate = items[middle].orderKey
    const sortsBefore =
      candidate === null ||
      (dir === "asc"
        ? compareCodePoints(candidate, orderKey) < 0
        : compareCodePoints(candidate, orderKey) > 0)
    if (sortsBefore) low = middle + 1
    else high = middle
  }
  return [...items.slice(0, low), row, ...items.slice(low)]
}

const patchesSortedField = (
  patch: UpdateTicketInput,
  key: TicketSort["key"]
): boolean => {
  if (key === "title") return patch.title !== undefined
  if (key === "priority") return patch.priority !== undefined
  return false
}

const localOrderKey = (ticket: Ticket, sort: TicketSort): string => {
  let value: string
  switch (sort.key) {
    case "id":
      value = padNumericIdSort(ticket.id) ?? ticket.id
      break
    case "created":
      value = ticket.createdAt.toISOString()
      break
    case "updated":
      value = ticket.updatedAt.toISOString()
      break
    case "title":
      value = ticket.title.toLowerCase()
      break
    case "priority":
      value = String(PRIORITY_META[ticket.priority].ordinal + 1).padStart(
        2,
        "0"
      )
      break
  }
  return `${value}\u0000${ticket.id}`
}

export const patchSectionsRow = <S extends SectionValue<string>>(
  value: SectionsValue<S>,
  id: TicketId,
  patch: UpdateTicketInput,
  query: TicketListQuery,
  viewerId: UserId | undefined,
  now: Date,
  sectionOf?: (ticket: Ticket) => S["key"]
): SectionsValue<S> => {
  let patched: BacklogRow | undefined
  let from: TicketStatus | undefined
  let fromSection: S["key"] | undefined
  let staysCounted = true
  let staysVisible = true
  const sections = value.sections.map((section) => {
    const items: Array<BacklogRow> = []
    let found: BacklogRow | undefined
    for (const row of section.page.items) {
      if (row.ticket.id !== id) {
        items.push(row)
        continue
      }
      from = row.ticket.status
      fromSection = section.key
      found = {
        ...row,
        ticket: { ...applyTicketPatch(row.ticket, patch), updatedAt: now },
        pending: true
      }
      if (
        query.sort.key === "updated" ||
        patchesSortedField(patch, query.sort.key)
      ) {
        found = { ...found, orderKey: localOrderKey(found.ticket, query.sort) }
      }
      patched = found
      staysCounted = matchesTicketQuery(
        found.ticket,
        { ...query, status: undefined },
        viewerId
      )
      staysVisible = matchesTicketQuery(found.ticket, query, viewerId)
    }
    if (found === undefined) return section
    return {
      ...section,
      count: section.count - (staysVisible ? 0 : 1),
      page: {
        ...section.page,
        items: staysVisible
          ? insertByOrderKey(items, found, query.sort.dir)
          : items
      }
    }
  })
  if (!patched || from === undefined) return value
  const target = sectionOf?.(patched.ticket) ?? fromSection
  const moved =
    staysVisible && target !== fromSection
      ? moveRow(sections, patched, fromSection, target, query.sort.dir)
      : sections
  const to = patched.ticket.status
  if (to === from && staysCounted && staysVisible) {
    return { ...value, sections: moved }
  }
  const byStatus = { ...value.counts.byStatus }
  byStatus[from] = Math.max(0, (byStatus[from] ?? 0) - 1)
  if (staysCounted) byStatus[to] = (byStatus[to] ?? 0) + 1
  return {
    ...value,
    total: value.total - (staysVisible ? 0 : 1),
    counts: {
      total: value.counts.total - (staysCounted ? 0 : 1),
      byStatus
    },
    sections: moved
  }
}

const moveRow = <S extends SectionValue<string>>(
  sections: ReadonlyArray<S>,
  row: BacklogRow,
  from: S["key"] | undefined,
  to: S["key"] | undefined,
  dir: TicketSort["dir"]
): ReadonlyArray<S> => {
  if (!sections.some((section) => section.key === to)) return sections
  return sections.map((section) => {
    if (section.key === from) {
      return {
        ...section,
        count: Math.max(0, section.count - 1),
        page: {
          ...section.page,
          items: section.page.items.filter(
            (item) => item.ticket.id !== row.ticket.id
          )
        }
      }
    }
    if (section.key === to) {
      return {
        ...section,
        count: section.count + 1,
        page: {
          ...section.page,
          items: insertByOrderKey(section.page.items, row, dir)
        }
      }
    }
    return section
  })
}

export const replaceSectionsRow = <S extends SectionValue<string>>(
  value: SectionsValue<S>,
  ticket: Ticket,
  orderKey: string | null,
  sort: TicketSort,
  sectionOf?: (ticket: Ticket) => S["key"]
): SectionsValue<S> => {
  let fromSection: S["key"] | undefined
  let replaced: BacklogRow | undefined
  const sections = value.sections.map((section) => {
    if (orderKey === null) {
      return {
        ...section,
        page: {
          ...section.page,
          items: section.page.items.map((row) => {
            if (row.ticket.id !== ticket.id) return row
            fromSection = section.key
            replaced = { ...row, ticket, pending: false }
            return replaced
          })
        }
      }
    }
    const items: Array<BacklogRow> = []
    let moved: BacklogRow | undefined
    for (const row of section.page.items) {
      if (row.ticket.id === ticket.id)
        moved = { ...row, ticket, orderKey, pending: false }
      else items.push(row)
    }
    if (moved === undefined) return section
    fromSection = section.key
    replaced = moved
    return {
      ...section,
      page: {
        ...section.page,
        items: insertByOrderKey(items, moved, sort.dir)
      }
    }
  })
  const target = sectionOf?.(ticket) ?? fromSection
  return {
    ...value,
    sections:
      replaced !== undefined && target !== fromSection
        ? moveRow(sections, replaced, fromSection, target, sort.dir)
        : sections
  }
}

export const loadMoreSection = <K extends string, E, SE, BE>(
  get: Atom.FnContext,
  {
    key,
    sections,
    snapshot,
    loadedPages,
    pageQuery
  }: Readonly<{
    key: K
    sections: Atom.Atom<
      AsyncResult.AsyncResult<SectionsValue<SectionValue<K>>, SE>
    >
    snapshot: Atom.Atom<
      AsyncResult.AsyncResult<
        Readonly<{
          sections: ReadonlyArray<Readonly<{ key: K; page: TicketListPage }>>
        }>,
        BE
      >
    >
    loadedPages: Atom.Writable<Readonly<Record<string, number>>>
    pageQuery: (
      cursor: string
    ) => Atom.Atom<AsyncResult.AsyncResult<TicketListPage, E>>
  }>
) =>
  Effect.gen(function* () {
    const current = get(sections)
    if (!AsyncResult.isSuccess(current)) return yield* Effect.void
    const cursor = current.value.sections.find((section) => section.key === key)
      ?.page.nextCursor
    if (!cursor) return yield* Effect.void
    const loaded = get(loadedPages)
    const depth = loaded[key] ?? 0
    const base = get(snapshot)
    if (!AsyncResult.isSuccess(base)) return yield* Effect.void
    let pageCursor: string | null =
      base.value.sections.find((section) => section.key === key)?.page
        .nextCursor ?? null
    for (let index = 0; index < depth; index++) {
      if (pageCursor === null) break
      const page = pageQuery(pageCursor)
      if (pageCursor === cursor) {
        return yield* Effect.callback<TicketListPage, E>((resume) => {
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
        })
      }
      const result = get(page)
      if (!AsyncResult.isSuccess(result)) return yield* Effect.void
      pageCursor = result.value.nextCursor
    }
    get.set(loadedPages, { ...loaded, [key]: depth + 1 })
    return yield* get.result(pageQuery(cursor), { suspendOnWaiting: true })
  })
