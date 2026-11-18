import {
  PinOrderKey,
  type PinKind,
  type PinnedTicket,
  type PinnedSprint,
  type PinTarget,
  type SidebarPin
} from "@pp/shared"
import * as Schema from "effect/Schema"
import { generateKeyBetween } from "fractional-indexing"

export type PinRef = Readonly<{
  projectSlug: string
  kind: PinKind
  ref: string
}>

export type PinPrediction =
  | Readonly<{ ticket: PinnedTicket }>
  | Readonly<{ sprint: PinnedSprint }>

const decodeOrderKey = Schema.decodeSync(PinOrderKey)

export const pinKey = (pin: PinRef): string =>
  `${pin.projectSlug}:${pin.kind}:${pin.ref}`

export const samePin = (a: PinRef, b: PinRef): boolean =>
  a.projectSlug === b.projectSlug && a.kind === b.kind && a.ref === b.ref

export const pinsIn = (
  pins: ReadonlyArray<SidebarPin>,
  projectSlug: string
): ReadonlyArray<SidebarPin> =>
  pins.filter((pin) => pin.projectSlug === projectSlug)

const compareBytes = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

const comparePins = (a: SidebarPin, b: SidebarPin) =>
  compareBytes(a.projectSlug, b.projectSlug) ||
  compareBytes(a.orderKey, b.orderKey) ||
  compareBytes(a.kind, b.kind) ||
  compareBytes(a.ref, b.ref)

export const withPin = (
  pins: ReadonlyArray<SidebarPin>,
  pin: SidebarPin
): ReadonlyArray<SidebarPin> =>
  [...pins.filter((each) => !samePin(each, pin)), pin].toSorted(comparePins)

export const withoutPin = (
  pins: ReadonlyArray<SidebarPin>,
  target: PinRef
): ReadonlyArray<SidebarPin> => pins.filter((pin) => !samePin(pin, target))

export const predictPin = (
  pins: ReadonlyArray<SidebarPin>,
  projectSlug: string,
  payload: PinTarget,
  prediction: PinPrediction
): SidebarPin | null => {
  const [top] = pinsIn(pins, projectSlug)
  const orderKey = decodeOrderKey(
    generateKeyBetween(null, top?.orderKey ?? null)
  )
  if (payload.kind === "ticket" && "ticket" in prediction)
    return {
      projectSlug,
      kind: "ticket",
      ref: payload.ref,
      orderKey,
      ticket: prediction.ticket
    }
  if (payload.kind === "sprint" && "sprint" in prediction)
    return {
      projectSlug,
      kind: "sprint",
      ref: payload.ref,
      orderKey,
      sprint: prediction.sprint
    }
  return null
}

export const withPredictedPin = (
  pins: ReadonlyArray<SidebarPin>,
  projectSlug: string,
  payload: PinTarget,
  prediction: PinPrediction
): ReadonlyArray<SidebarPin> => {
  const pin = predictPin(pins, projectSlug, payload, prediction)
  return pin === null ? pins : withPin(pins, pin)
}

export function showsLiveRow(
  viewing: PinTarget | null,
  activeSprintId: string | null,
  pinned: boolean
): viewing is PinTarget {
  if (viewing === null || pinned) return false
  return !(viewing.kind === "sprint" && viewing.ref === activeSprintId)
}

export type PinMove = Readonly<{ pin: SidebarPin; orderKey: PinOrderKey }>

const withoutKey = (keys: ReadonlyArray<string>, key: string) =>
  keys.filter((each) => each !== key)

const sameKeys = (a: ReadonlyArray<string>, b: ReadonlyArray<string>) =>
  a.length === b.length && a.every((key, index) => key === b[index])

export const movedPin = (
  pins: ReadonlyArray<SidebarPin>,
  order: ReadonlyArray<string>
): PinMove | null => {
  const byKey = new Map(pins.map((pin) => [pinKey(pin), pin] as const))
  const before = pins.map(pinKey)
  const after = order.filter((key) => byKey.has(key))
  if (after.length !== before.length || sameKeys(before, after)) return null
  const moved = before.find(
    (key) =>
      before.indexOf(key) !== after.indexOf(key) &&
      sameKeys(withoutKey(before, key), withoutKey(after, key))
  )
  const pin = moved === undefined ? undefined : byKey.get(moved)
  if (moved === undefined || pin === undefined) return null
  const at = after.indexOf(moved)
  const previous = byKey.get(after[at - 1] ?? "")
  const next = byKey.get(after[at + 1] ?? "")
  return {
    pin,
    orderKey: decodeOrderKey(
      generateKeyBetween(previous?.orderKey ?? null, next?.orderKey ?? null)
    )
  }
}

export const withOrderKey = (
  pins: ReadonlyArray<SidebarPin>,
  target: PinRef,
  orderKey: PinOrderKey
): ReadonlyArray<SidebarPin> => {
  const pin = pins.find((each) => samePin(each, target))
  return pin === undefined ? pins : withPin(pins, { ...pin, orderKey })
}

export type PinNode<Row> = Readonly<{
  row: Row
  children: ReadonlyArray<PinNode<Row>>
}>

type TicketLink = Readonly<{ id: string; parent: string | null }>

// The rows as a tree: a ticket's row goes under the row of the ticket (or
// epic) it sits under when that row is in the list too, pinned or live; the
// rest stay at the top. Order is kept at every level.
export const nestPins = <Row>(
  rows: ReadonlyArray<Row>,
  ticketOf: (row: Row) => TicketLink | null
): ReadonlyArray<PinNode<Row>> => {
  const byTicket = new Map<string, Row>()
  for (const row of rows) {
    const ticket = ticketOf(row)
    if (ticket !== null && !byTicket.has(ticket.id))
      byTicket.set(ticket.id, row)
  }
  const parentOf = (row: Row): Row | undefined => {
    const parent = ticketOf(row)?.parent
    return parent == null ? undefined : byTicket.get(parent)
  }
  // A row whose parents lead back to it (data mid-update) stays at the top.
  const nests = (row: Row): boolean => {
    let parent = parentOf(row)
    for (let step = 0; parent !== undefined && step < rows.length; step++) {
      if (parent === row) return false
      parent = parentOf(parent)
    }
    return parentOf(row) !== undefined && parent === undefined
  }
  const children = new Map<Row, Row[]>()
  const top: Row[] = []
  for (const row of rows) {
    const parent = nests(row) ? parentOf(row) : undefined
    if (parent === undefined) top.push(row)
    else children.set(parent, [...(children.get(parent) ?? []), row])
  }
  const node = (row: Row): PinNode<Row> => ({
    row,
    children: (children.get(row) ?? []).map(node)
  })
  return top.map(node)
}

export const ticketLinkOf = (display: PinPrediction): TicketLink | null =>
  "ticket" in display
    ? { id: display.ticket.id, parent: display.ticket.parent ?? null }
    : null
