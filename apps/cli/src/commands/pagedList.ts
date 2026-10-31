import * as Effect from "effect/Effect"

import { isRows, printResult, tableLayout } from "../output/format"
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
  isRows(items) ? items.map((row) => `${layout.row(row)}\n`).join("") : ""

const streamRest = <E, R>(
  fetch: (cursor: string) => Effect.Effect<Page, E, R>,
  sink: PagerSink,
  layout: Layout,
  cursor: string | null,
  count: number
): Effect.Effect<number, E, R> =>
  cursor === null
    ? Effect.succeed(count)
    : Effect.gen(function* () {
        const page = yield* fetch(cursor)
        const open = yield* sink.write(rowsText(page.items, layout))
        const total = count + page.items.length
        return open
          ? yield* streamRest(fetch, sink, layout, page.nextCursor, total)
          : -1
      })

export const pagedList = <E, R>(
  fetch: (cursor: string | undefined) => Effect.Effect<Page, E, R>,
  noun: string
) =>
  Effect.gen(function* () {
    const first = yield* fetch(undefined).pipe(withLoading(`Loading ${noun}`))
    const layout = isRows(first.items) ? tableLayout(first.items) : undefined
    if (layout === undefined) return yield* printResult(first, false)
    yield* withPager((sink) =>
      Effect.gen(function* () {
        const open = yield* sink.write(
          `${layout.header}\n${rowsText(first.items, layout)}`
        )
        if (!open) return undefined
        const total = yield* streamRest(
          fetch,
          sink,
          layout,
          first.nextCursor,
          first.items.length
        )
        if (total >= 0) yield* sink.write(`\n${countText(total, noun)}\n`)
        return undefined
      })
    )
  })
