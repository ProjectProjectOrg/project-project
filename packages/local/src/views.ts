import * as Context from "effect/Context"
import * as DateTime from "effect/DateTime"
import * as Deferred from "effect/Deferred"
import * as Effect from "effect/Effect"
import * as Match from "effect/Match"
import * as Option from "effect/Option"
import * as Reactivity from "effect/reactivity/Reactivity"
import * as Schema from "effect/Schema"
import * as SqlClient from "effect/sql/SqlClient"

import { timed } from "./LocalDb"
import {
  type LocalProject,
  ParentSectionsRequest,
  scopeOf,
  SectionsRequest
} from "./LocalRpcs"
import { localParentSections } from "./parents"
import { localSections } from "./sections"
import { localSprintSections } from "./sprints"
import { copyOf } from "./store"

export const projectKey = (scope: string) => `local-project:${scope}`

export const readCopy = <A, E, R>(
  label: string,
  project: LocalProject,
  read: (copy: number) => Effect.Effect<A | null, E, R>
) =>
  Effect.flatMap(SqlClient.SqlClient, (sql) =>
    timed(`read ${label}`)(
      sql.withTransaction(
        Effect.flatMap(copyOf(scopeOf(project)), (copy) =>
          copy === null ? Effect.succeed(null) : read(copy)
        )
      )
    )
  )

export const sectionsRequest = (request: SectionsRequest, copy: number) => ({
  copy,
  query: request.query,
  viewerId: request.viewerId,
  estimation: request.estimation,
  repository: (repoId: string | null) =>
    repoId === null
      ? request.repositories.fallback
      : (request.repositories.byId[repoId] ?? null),
  perStatus: (status: string) =>
    request.pageSize * (1 + (request.pages[status] ?? 0))
})

export const readSections = (request: SectionsRequest) =>
  readCopy("Sections", request.project, (copy) =>
    localSections(sectionsRequest(request, copy))
  )

export const readSprintSections = (request: SectionsRequest) =>
  readCopy("SprintSections", request.project, (copy) =>
    Effect.flatMap(DateTime.nowAsDate, (now) =>
      localSprintSections({
        ...sectionsRequest(request, copy),
        pages: request.pages,
        pageSize: request.pageSize,
        now
      })
    )
  )

export const readParentSections = (
  request: typeof ParentSectionsRequest.Type
) =>
  readCopy(`ParentSections ${request.by}`, request.project, (copy) =>
    localParentSections({
      ...sectionsRequest(request, copy),
      by: request.by,
      pages: request.pages,
      pageSize: request.pageSize
    })
  )

export const SectionsView = Schema.TaggedStruct("Sections", {
  request: SectionsRequest
})
export const SprintSectionsView = Schema.TaggedStruct("SprintSections", {
  request: SectionsRequest
})
export const ParentSectionsView = Schema.TaggedStruct("ParentSections", {
  request: ParentSectionsRequest
})

export const LastView = Schema.Union([
  SectionsView,
  SprintSectionsView,
  ParentSectionsView
])
export type LastView = typeof LastView.Type

const encodeLastView = Schema.encodeSync(Schema.fromJsonString(LastView))

const readView = (view: LastView) =>
  Match.valueTags(view, {
    Sections: ({ request }) =>
      Effect.map(readSections(request), (value) => ({
        _tag: "Sections" as const,
        value
      })),
    SprintSections: ({ request }) =>
      Effect.map(readSprintSections(request), (value) => ({
        _tag: "SprintSections" as const,
        value
      })),
    ParentSections: ({ request }) =>
      Effect.map(readParentSections(request), (value) => ({
        _tag: "ParentSections" as const,
        value
      }))
  })

type ViewResult = Effect.Success<ReturnType<typeof readView>>

type Warm = Readonly<{
  key: string
  take: Effect.Effect<Option.Option<ViewResult>>
}>

export class WarmView extends Context.Reference<Warm | null>(
  "@pp/local/WarmView",
  { defaultValue: () => null }
) {}

export const prefetchView = (view: LastView) =>
  Effect.gen(function* () {
    const reactivity = yield* Reactivity.Reactivity
    const result = yield* Deferred.make<Option.Option<ViewResult>>()
    let usable = true
    const unregister = reactivity.registerUnsafe(
      [projectKey(scopeOf(view.request.project))],
      () => {
        usable = false
      }
    )
    yield* readView(view).pipe(
      Effect.flatMap((read) => Deferred.succeed(result, Option.some(read))),
      Effect.ensuring(Deferred.succeed(result, Option.none())),
      Effect.forkDetach
    )
    const take = Effect.map(Deferred.await(result), (read) => {
      const answer = usable ? read : Option.none()
      usable = false
      unregister()
      return answer
    })
    return { key: encodeLastView(view), take } satisfies Warm
  })

export const servedFirst = <A, E, R>(
  warm: Warm | null,
  view: LastView,
  read: Effect.Effect<A, E, R>,
  pick: (result: ViewResult) => Option.Option<A>
) => {
  let first = true
  return Effect.suspend(() => {
    if (!first) return read
    first = false
    if (warm === null || warm.key !== encodeLastView(view)) return read
    return Effect.flatMap(warm.take, (taken) =>
      Option.match(Option.flatMap(taken, pick), {
        onNone: () => read,
        onSome: Effect.succeed
      })
    )
  })
}
