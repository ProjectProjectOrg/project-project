import * as SqliteClient from "@effect/sql-sqlite-wasm/SqliteClient"
import { it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Match from "effect/Match"
import * as Option from "effect/Option"
import * as Reactivity from "effect/reactivity/Reactivity"
import { expect } from "vitest"

import { localDbLayer } from "./LocalDb"
import type { SectionsRequest } from "./LocalRpcs"
import { install, snapshot, ticket } from "./testFacts"
import {
  type LastView,
  prefetchView,
  projectKey,
  servedFirst,
  SectionsView
} from "./views"

const TestDatabase = localDbLayer.pipe(
  Layer.provideMerge(SqliteClient.layerMemory({})),
  Layer.provideMerge(Reactivity.layer)
)

const request: SectionsRequest = {
  project: { orgSlug: "a", slug: "p" },
  query: { sort: { key: "id", dir: "asc" } },
  viewerId: undefined,
  estimation: "off",
  repositories: { fallback: null, byId: {} },
  pages: {},
  pageSize: 50
}

const view: LastView = SectionsView.make({ request })

const firstAnswer = (warm: Effect.Success<ReturnType<typeof prefetchView>>) =>
  Effect.gen(function* () {
    let reads = 0
    const read = Effect.sync(() => {
      reads += 1
      return null
    })
    const answer = yield* servedFirst(
      warm,
      view,
      read,
      Match.valueTags({
        Sections: ({ value }) => Option.some(value),
        SprintSections: () => Option.none(),
        ParentSections: () => Option.none()
      })
    )
    return { answer, reads }
  })

it.effect("a prefetched view answers the first request for it", () =>
  Effect.gen(function* () {
    yield* install("a/p", snapshot("1.1", [ticket("T-1", "one")]))
    const warm = yield* prefetchView(view)

    const { answer, reads } = yield* firstAnswer(warm)
    expect(reads).toBe(0)
    expect(answer?.counts.total).toBe(1)
  }).pipe(Effect.provide(TestDatabase))
)

it.effect("a change after the prefetch makes the first request read", () =>
  Effect.gen(function* () {
    yield* install("a/p", snapshot("1.1", [ticket("T-1", "one")]))
    const warm = yield* prefetchView(view)
    yield* Reactivity.invalidate([projectKey("a/p")])

    const { reads } = yield* firstAnswer(warm)
    expect(reads).toBe(1)
  }).pipe(Effect.provide(TestDatabase))
)
