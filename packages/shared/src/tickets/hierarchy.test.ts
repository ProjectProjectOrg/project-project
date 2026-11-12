import { describe, expect, it } from "vitest"

import {
  canHaveParent,
  canHoldChildren,
  canJoinSprint,
  EPIC_TYPE,
  hasSubTickets,
  isEpic,
  isEpicType
} from "./hierarchy"
import { TicketType } from "./Ticket"

const otherTypes = TicketType.literals.filter((type) => type !== EPIC_TYPE)

describe("isEpicType", () => {
  it("is true for the epic type only", () => {
    expect(isEpicType(EPIC_TYPE)).toBe(true)
    expect(otherTypes.map((type) => isEpicType(type))).toEqual(
      otherTypes.map(() => false)
    )
  })

  it("is false without a type", () => {
    expect(isEpicType(null)).toBe(false)
    expect(isEpicType(undefined)).toBe(false)
  })
})

describe("isEpic", () => {
  it("reads the type of a ticket", () => {
    expect(isEpic({ type: "epic" })).toBe(true)
    expect(isEpic({ type: "feat" })).toBe(false)
  })

  it("is false for a missing ticket", () => {
    expect(isEpic(null)).toBe(false)
    expect(isEpic(undefined)).toBe(false)
  })
})

describe("canHaveParent and canJoinSprint", () => {
  it("exclude epics and allow every other type", () => {
    expect(canHaveParent(EPIC_TYPE)).toBe(false)
    expect(canJoinSprint(EPIC_TYPE)).toBe(false)
    expect(otherTypes.every((type) => canHaveParent(type))).toBe(true)
    expect(otherTypes.every((type) => canJoinSprint(type))).toBe(true)
  })
})

describe("canHoldChildren", () => {
  it("lets an epic hold tickets", () => {
    expect(canHoldChildren({ type: "epic" }, null)).toBe(true)
  })

  it("lets a ticket without a parent hold sub-tickets", () => {
    expect(canHoldChildren({ type: "feat" }, null)).toBe(true)
    expect(canHoldChildren({ type: "feat" }, undefined)).toBe(true)
  })

  it("lets a ticket under an epic hold sub-tickets", () => {
    expect(canHoldChildren({ type: "feat" }, { type: "epic" })).toBe(true)
  })

  it("stops a sub-ticket from holding sub-tickets", () => {
    expect(canHoldChildren({ type: "bug" }, { type: "feat" })).toBe(false)
  })
})

describe("hasSubTickets", () => {
  it("is true only with a positive count", () => {
    expect(hasSubTickets({ subTicketCount: 2 })).toBe(true)
    expect(hasSubTickets({ subTicketCount: 0 })).toBe(false)
    expect(hasSubTickets({})).toBe(false)
  })
})
