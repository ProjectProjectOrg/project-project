import { GroupId, SidebarPin, StatusSlug, TicketId } from "@pp/shared"
import * as Schema from "effect/Schema"
import { describe, expect, it } from "vitest"

import { movedPin, showsLiveRow, withoutPin, withPredictedPin } from "./pins"

const decodePin = Schema.decodeSync(SidebarPin)
const ticketId = Schema.decodeSync(TicketId)
const groupId = Schema.decodeSync(GroupId)
const todo = Schema.decodeSync(StatusSlug)("todo")

const ticketPin = (projectSlug: string, id: string, orderKey: string) =>
  decodePin({
    projectSlug,
    kind: "ticket",
    ref: id,
    orderKey,
    ticket: { id, title: id, status: "todo", archivedAt: null }
  })

const linked = (id: string) => ({
  id: ticketId(id),
  title: id,
  status: todo,
  archivedAt: null
})

describe("withPredictedPin", () => {
  it("puts the new pin above the project's top pin", () => {
    const pins = [
      ticketPin("api", "API-1", "a0"),
      ticketPin("web", "WEB-1", "a0")
    ]
    const next = withPredictedPin(
      pins,
      "web",
      { kind: "ticket", ref: ticketId("WEB-2") },
      { ticket: linked("WEB-2") }
    )
    expect(next.map((pin) => pin.ref)).toEqual(["API-1", "WEB-2", "WEB-1"])
  })

  it("does not duplicate a pin that is already there", () => {
    const pins = [ticketPin("web", "WEB-1", "a0")]
    const next = withPredictedPin(
      pins,
      "web",
      { kind: "ticket", ref: ticketId("WEB-1") },
      { ticket: linked("WEB-1") }
    )
    expect(next.map((pin) => pin.ref)).toEqual(["WEB-1"])
  })

  it("ignores a prediction that does not match the payload's kind", () => {
    const pins = [ticketPin("web", "WEB-1", "a0")]
    expect(
      withPredictedPin(
        pins,
        "web",
        { kind: "sprint", ref: groupId("G-1") },
        { ticket: linked("WEB-2") }
      )
    ).toBe(pins)
  })
})

describe("withoutPin", () => {
  it("removes only the pin in that project", () => {
    const pins = [
      ticketPin("api", "API-1", "a0"),
      ticketPin("web", "API-1", "a0")
    ]
    expect(
      withoutPin(pins, { projectSlug: "web", kind: "ticket", ref: "API-1" })
    ).toEqual([pins[0]])
  })
})

describe("showsLiveRow", () => {
  const ticket = { kind: "ticket", ref: ticketId("WEB-1") } as const
  const sprint = { kind: "sprint", ref: groupId("G-2") } as const

  it("shows the page you are on until it is pinned", () => {
    expect(showsLiveRow(ticket, null, false)).toBe(true)
    expect(showsLiveRow(ticket, null, true)).toBe(false)
    expect(showsLiveRow(null, null, false)).toBe(false)
  })

  it("leaves the running sprint to its Current row", () => {
    expect(showsLiveRow(sprint, "G-2", false)).toBe(false)
    expect(showsLiveRow(sprint, "G-1", false)).toBe(true)
  })
})

describe("movedPin", () => {
  const pins = [
    ticketPin("web", "WEB-1", "a0"),
    ticketPin("web", "WEB-2", "a1"),
    ticketPin("web", "WEB-3", "a2")
  ]

  it("finds the one pin that moved and keys it between its new neighbours", () => {
    const move = movedPin(pins, [
      "web:ticket:WEB-3",
      "web:ticket:WEB-1",
      "web:ticket:WEB-2"
    ])
    expect(move?.pin.ref).toBe("WEB-3")
    expect(move !== null && move.orderKey < "a0").toBe(true)
  })

  it("moves a pin down between two others", () => {
    const move = movedPin(pins, [
      "web:ticket:WEB-2",
      "web:ticket:WEB-1",
      "web:ticket:WEB-3"
    ])
    expect(move?.pin.ref).toBe("WEB-1")
    expect(move !== null && move.orderKey > "a1" && move.orderKey < "a2").toBe(
      true
    )
  })

  it("ignores the live row and an unchanged order", () => {
    expect(
      movedPin(pins, [
        "web:ticket:WEB-9",
        "web:ticket:WEB-1",
        "web:ticket:WEB-2",
        "web:ticket:WEB-3"
      ])
    ).toBeNull()
  })
})
