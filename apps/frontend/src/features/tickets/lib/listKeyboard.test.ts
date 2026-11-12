import { expect, it } from "vitest"

import { stepTicket } from "./listKeyboard"

const sections = [["T-1", "T-2"], [], ["T-3"]]

it("steps across sections, skipping empty ones", () => {
  expect(stepTicket(sections, "T-2", 1)).toBe("T-3")
  expect(stepTicket(sections, "T-3", -1)).toBe("T-2")
})

it("stays on the first or last ticket at the ends", () => {
  expect(stepTicket(sections, "T-1", -1)).toBe("T-1")
  expect(stepTicket(sections, "T-3", 1)).toBe("T-3")
})

it("starts from the first ticket when the current one is not shown", () => {
  expect(stepTicket(sections, null, -1)).toBe("T-1")
  expect(stepTicket(sections, "T-9", 1)).toBe("T-1")
  expect(stepTicket([], null, 1)).toBeNull()
})
