import * as Effect from "effect/Effect"

import {
  human,
  isRows,
  printResult,
  tableLayout,
  type ResultLayout
} from "../output/format"
import { withLoading } from "../output/loading"
import { type PagerSink, withPager } from "../output/pager"

type Page = Readonly<{
  items: ReadonlyArray<unknown>
  nextCursor: string | null
}>

type Layout = NonNullable<ReturnType<typeof tableLayout>>

const countText = (count: number, noun: string) =>
  `${count} ${count === 1 ? noun.replace(/s$/, "") : noun}`

const rowsText = (items: ReadonlyArray<unknown>, layout: Layout) =>
  isRows(items) ? items.map((row) => `${layout.laterRow(row)}\n`).join("") : ""

const streamRest = <E, R>(
  fetch: (cursor: string) => Effect.Effect<Page, E, R>,
  sink: PagerSink,
  pageText: (page: Page) => string,
  first: Page
) =>
  Effect.gen(function* () {
    let cursor = first.nextCursor
    let total = first.items.length
    while (cursor !== null) {
      const page = yield* fetch(cursor)
      const open = yield* sink.write(pageText(page))
      if (!open) return -1
      total += page.items.length
      cursor = page.nextCursor
    }
    return total
  })

export const pagedList = <E, R>(
  fetch: (cursor: string | undefined) => Effect.Effect<Page, E, R>,
  noun: string,
  format: ResultLayout = "table"
) =>
  Effect.gen(function* () {
    const first = yield* fetch(undefined).pipe(withLoading(`Loading ${noun}`))
    const layout = isRows(first.items) ? tableLayout(first.items) : undefined
    if (layout === undefined && format === "table")
      return yield* printResult(first, false)
    const pageText = (page: Page) =>
      format === "details"
        ? `${human({ ...page, nextCursor: null }, format)}\n\n`
        : layout === undefined
          ? ""
          : rowsText(page.items, layout)
    yield* withPager((sink) =>
      Effect.gen(function* () {
        const open = yield* sink.write(
          `${format === "table" && layout !== undefined ? `${layout.header}\n` : ""}${pageText(first)}`
        )
        if (!open) return undefined
        const total = yield* streamRest(fetch, sink, pageText, first)
        if (total >= 0) yield* sink.write(`\n${countText(total, noun)}\n`)
        return undefined
      })
    )
  })
