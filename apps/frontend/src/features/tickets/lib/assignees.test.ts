import { describe, expect, it } from "vitest"

import { toggleAssignee } from "./assignees"

describe("toggleAssignee", () => {
  it("adds someone after the people already assigned", () => {
    expect(toggleAssignee(["ana", "bo"], "me")).toEqual(["ana", "bo", "me"])
  })

  it("removes only that person and keeps the others in order", () => {
    expect(toggleAssignee(["ana", "me", "bo"], "me")).toEqual(["ana", "bo"])
  })

  it("assigns someone to an unassigned ticket", () => {
    expect(toggleAssignee([], "me")).toEqual(["me"])
  })
})
