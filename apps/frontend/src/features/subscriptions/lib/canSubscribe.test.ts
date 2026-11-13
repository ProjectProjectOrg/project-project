import { UserId } from "@pp/shared"
import * as Schema from "effect/Schema"
import { describe, expect, it } from "vitest"

import { canSubscribe } from "./canSubscribe"

const userId = Schema.decodeUnknownSync(UserId)

describe("canSubscribe", () => {
  it("lets project members subscribe but not admins who only see the project", () => {
    const project = { members: [{ id: userId("member") }] }
    expect(canSubscribe(project, "member")).toBe(true)
    expect(canSubscribe(project, "org-admin")).toBe(false)
  })
})
