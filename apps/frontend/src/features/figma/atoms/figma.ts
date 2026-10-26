import type { ConnectFigmaProjectInput, TicketId } from "@pp/shared"
import * as Atom from "effect/reactivity/Atom"

import { Api } from "@/api/Api"
import { Keys, projectScope } from "@/api/keys"
import { replaceWith, viewMutation } from "@/api/viewMutation"

export type FigmaProjectRequest = Readonly<{
  params: Readonly<{ orgSlug: string; slug: string }>
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

export const disconnectFigmaProfileAtom = viewMutation(figmaProfileAtom, {
  name: "disconnectFigmaProfile",
  predict: (profile, _input: void) => ({
    ...profile,
    connected: false,
    figmaUserId: null,
    handle: null,
    email: null,
    lastVerifiedAt: null,
    lastCheckError: null
  }),
  call: () => Api.use((client) => client.figma.disconnectProfile()),
  confirm: replaceWith
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
  viewMutation(figmaProjectStatusAtom(req), {
    name: "connectFigmaProject",
    predict: (status, _input: ConnectFigmaProjectInput) => ({
      ...status,
      connected: true,
      lastCheckStatus: "ok" as const,
      lastCheckError: null
    }),
    call: (input) =>
      Api.use((client) =>
        client.figma.connectProject({ params: req.params, payload: input })
      ),
    confirm: replaceWith,
    publish: () => [Keys.figmaTicketLinks(scopeOf(req))]
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
    viewMutation(figmaProjectStatusAtom(req), {
      name: "disconnectFigmaProject",
      predict: (status, _input: void) => ({
        ...status,
        connected: false,
        handle: null,
        connectedAt: null,
        lastCheckStatus: null,
        lastCheckError: null
      }),
      call: () =>
        Api.use((client) =>
          client.figma.disconnectProject({ params: req.params })
        ),
      confirm: replaceWith,
      publish: () => [Keys.figmaTicketLinks(scopeOf(req))]
    })
)
