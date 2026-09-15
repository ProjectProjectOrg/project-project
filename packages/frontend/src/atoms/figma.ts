import * as Effect from "effect/Effect"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import * as Atom from "effect/unstable/reactivity/Atom"
import * as Reactivity from "effect/unstable/reactivity/Reactivity"
import type { ConnectFigmaProjectInput, TicketId } from "@projectproject/shared"
import { Api } from "@/api/Api"
import { Keys, projectScope } from "@/api/keys"

export type FigmaProjectRequest = Readonly<{
  params: Readonly<{ orgSlug: string; readonly slug: string }>
}>

export type FigmaTicketLinksRequest = Readonly<{
  params: Readonly<{
    orgSlug: string
    slug: string
    id: TicketId
  }>
}>

export const figmaProjectRequest = (
  orgSlug: string,
  slug: string
): FigmaProjectRequest => ({
  params: { orgSlug, slug }
})

export const figmaTicketLinksRequest = (
  orgSlug: string,
  slug: string,
  id: TicketId
): FigmaTicketLinksRequest => ({ params: { orgSlug, slug, id } })

const scopeOf = (req: FigmaProjectRequest | FigmaTicketLinksRequest) =>
  projectScope(req.params.orgSlug, req.params.slug)

const figmaProfileQuery = Api.query("figma", "profile", {
  timeToLive: "1 minute",
  reactivityKeys: [Keys.figmaProfile()]
})

export const figmaProfileAtom = Atom.optimistic(figmaProfileQuery)

export const disconnectFigmaProfileAtom = Atom.optimisticFn(figmaProfileAtom, {
  reducer: (current, _input: void) =>
    AsyncResult.map(current, (profile) => ({
      ...profile,
      connected: false,
      figmaUserId: null,
      handle: null,
      email: null,
      lastVerifiedAt: null,
      lastCheckError: null
    })),
  fn: (set) =>
    Api.runtime.fn(
      Effect.fn(function* (_input: void) {
        const profile = yield* Api.use((client) =>
          client.figma.disconnectProfile()
        )
        set(AsyncResult.success(profile))
        return profile
      })
    )
})

const figmaProjectQuery = (req: FigmaProjectRequest) =>
  Api.query("figma", "projectStatus", {
    params: req.params,
    timeToLive: "30 seconds",
    reactivityKeys: [Keys.figmaProject(scopeOf(req))]
  })

export const figmaProjectStatusAtom = Atom.family((req: FigmaProjectRequest) =>
  Atom.optimistic(figmaProjectQuery(req))
)

export const connectFigmaProjectAtom = Atom.family((req: FigmaProjectRequest) =>
  Atom.optimisticFn(figmaProjectStatusAtom(req), {
    reducer: (current, _input: ConnectFigmaProjectInput) =>
      AsyncResult.map(current, (status) => ({
        ...status,
        connected: true,
        lastCheckStatus: "ok" as const,
        lastCheckError: null
      })),
    fn: (set) =>
      Api.runtime.fn(
        Effect.fn(function* (input: ConnectFigmaProjectInput) {
          const status = yield* Api.use((client) =>
            client.figma.connectProject({
              params: req.params,
              payload: input
            })
          )
          set(AsyncResult.success(status))
          yield* Reactivity.invalidate([Keys.figmaTicketLinks(scopeOf(req))])
          return status
        })
      )
  })
)

const figmaTicketLinksQuery = (req: FigmaTicketLinksRequest) =>
  Api.query("figma", "ticketLinks", {
    params: req.params,
    timeToLive: "30 seconds",
    reactivityKeys: [Keys.figmaTicketLinks(scopeOf(req))]
  })

export const figmaTicketLinksAtom = Atom.family(
  (req: FigmaTicketLinksRequest) => Atom.optimistic(figmaTicketLinksQuery(req))
)

export const disconnectFigmaProjectAtom = Atom.family(
  (req: FigmaProjectRequest) =>
    Atom.optimisticFn(figmaProjectStatusAtom(req), {
      reducer: (current, _input: void) =>
        AsyncResult.map(current, (status) => ({
          ...status,
          connected: false,
          handle: null,
          connectedAt: null,
          lastCheckStatus: null,
          lastCheckError: null
        })),
      fn: (set) =>
        Api.runtime.fn(
          Effect.fn(function* (_input: void) {
            const status = yield* Api.use((client) =>
              client.figma.disconnectProject({ params: req.params })
            )
            set(AsyncResult.success(status))
            yield* Reactivity.invalidate([Keys.figmaTicketLinks(scopeOf(req))])
            return status
          })
        )
    })
)
