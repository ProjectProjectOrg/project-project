import { describe, expect, it } from "vitest"

import { keyFromName, keyProblem } from "./libraryModel"

describe("keys", () => {
  it("slugifies names and caps the length", () => {
    expect(keyFromName("Security review!")).toBe("security-review")
    expect(keyFromName("a".repeat(60)).length).toBe(48)
  })

  it("reports invalid, reserved and taken keys", () => {
    const taken = new Set(["chore"])
    expect(keyProblem("Bad key", "type", taken)).toBe("invalid")
    expect(keyProblem("blank", "type", taken)).toBe("reserved")
    expect(keyProblem("other", "type", taken)).toBe("reserved")
    expect(keyProblem("blank", "section", taken)).toBeNull()
    expect(keyProblem("chore", "section", taken)).toBe("taken")
  })

  it("keeps the key of the new-entry pages free", () => {
    expect(keyProblem("new", "type", new Set())).toBe("reserved")
    expect(keyProblem("new", "section", new Set())).toBe("reserved")
  })
})
