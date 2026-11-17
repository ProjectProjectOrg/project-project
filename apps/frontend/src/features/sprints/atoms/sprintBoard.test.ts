import { GroupId } from "@pp/shared"
import * as Schema from "effect/Schema"
import { describe, expect, it } from "vitest"

import { boardRequest, sprintBoard } from "./sprintBoard"

const groupId = Schema.decodeSync(GroupId)("G-1")

describe("sprintBoard", () => {
  it("shares one atom between structurally equal requests", () => {
    const a = boardRequest("acme", "web", groupId)
    const b = boardRequest("acme", "web", groupId)
    expect(sprintBoard(a)).toBe(sprintBoard(b))
  })
})
