import type {
  PinKind,
  PinTarget,
  ReorderPinInput,
  SidebarPin
} from "@pp/shared"
import * as Atom from "effect/reactivity/Atom"

import { Keys } from "@/api/keys"
import { query } from "@/api/query"
import { viewMutation } from "@/api/viewMutation"
import {
  withOrderKey,
  withoutPin,
  withPin,
  withPredictedPin,
  type PinPrediction
} from "@/features/pins/lib/pins"

export type PinsRequest = ReturnType<typeof pinsRequest>

export const pinsRequest = (orgSlug: string) =>
  ({
    _view: "pins",
    params: { orgSlug }
  }) as const

const pinsQuery = (req: PinsRequest) =>
  query("sidebarPins", "list", {
    params: req.params,
    timeToLive: "5 minutes",
    reactivityKeys: [Keys.pins(req.params.orgSlug)]
  })

export const pinsFor = Atom.family((req: PinsRequest) =>
  Atom.optimistic(pinsQuery(req))
)

export type PinInput = Readonly<{
  payload: PinTarget
  prediction: PinPrediction
}>

export const pinItem = Atom.family(
  ({ req, slug }: Readonly<{ req: PinsRequest; slug: string }>) =>
    viewMutation(pinsFor(req), {
      name: "pinItem",
      predict: (pins: ReadonlyArray<SidebarPin>, input: PinInput) =>
        withPredictedPin(pins, slug, input.payload, input.prediction),
      call: (client, { payload }) => {
        const params = { ...req.params, slug }
        return payload.kind === "ticket"
          ? client.sidebarPins.pin({ params, payload })
          : client.sidebarPins.pin({ params, payload })
      },
      confirm: withPin,
      publish: () => [Keys.pins(req.params.orgSlug)]
    })
)

export type PinItemKey = Readonly<{
  req: PinsRequest
  slug: string
  kind: PinKind
  ref: string
}>

export const unpinItem = Atom.family(({ req, slug, kind, ref }: PinItemKey) =>
  viewMutation(pinsFor(req), {
    name: "unpinItem",
    predict: (pins: ReadonlyArray<SidebarPin>, _input: void) =>
      withoutPin(pins, { projectSlug: slug, kind, ref }),
    call: (client) =>
      client.sidebarPins.unpin({
        params: { ...req.params, slug, kind, ref }
      }),
    confirm: (pins) => withoutPin(pins, { projectSlug: slug, kind, ref }),
    publish: () => [Keys.pins(req.params.orgSlug)]
  })
)

export const reorderPin = Atom.family(({ req, slug, kind, ref }: PinItemKey) =>
  viewMutation(pinsFor(req), {
    name: "reorderPin",
    predict: (pins: ReadonlyArray<SidebarPin>, input: ReorderPinInput) =>
      withOrderKey(pins, { projectSlug: slug, kind, ref }, input.orderKey),
    call: (client, payload) =>
      client.sidebarPins.reorder({
        params: { ...req.params, slug, kind, ref },
        payload
      }),
    confirm: withPin,
    publish: () => [Keys.pins(req.params.orgSlug)]
  })
)
