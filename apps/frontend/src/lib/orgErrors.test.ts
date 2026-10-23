import {
  Conflict,
  Forbidden,
  LastProjectPmBlocked,
  Validation
} from "@pp/shared"
import * as Exit from "effect/Exit"
import { describe, expect, it } from "vitest"

import { orgActionError, orgActionErrorFromExit } from "./orgErrors"

describe("orgActionError", () => {
  it("maps the tagged errors the org endpoints return", () => {
    const generic = orgActionError(new Forbidden()).message
    const messages = [
      orgActionError(new Conflict({ reason: "already_member" })).message,
      orgActionError(new Conflict({ reason: "already_invited" })).message,
      orgActionError(new Conflict({ reason: "last_owner" })).message,
      orgActionError(new Conflict({ reason: "last_owner_removal" })).message,
      orgActionError(new Validation({ reason: "role_not_found" })).message
    ]
    expect(new Set(messages).size).toBe(messages.length)
    for (const message of messages) expect(message).not.toBe(generic)
  })

  it("surfaces project slugs from the tagged removal block", () => {
    const result = orgActionError(
      new LastProjectPmBlocked({ projectSlugs: ["alpha", "beta"] })
    )
    expect(result.projectSlugs).toEqual(["alpha", "beta"])
    expect(result.message).not.toBe(orgActionError(new Forbidden()).message)
  })

  it("falls back for errors without a more specific message", () => {
    const result = orgActionError(new Forbidden())
    expect(result.message.length).toBeGreaterThan(0)
    expect(result.projectSlugs).toBeUndefined()
  })
})

describe("orgActionErrorFromExit", () => {
  it("returns null for a successful exit", () => {
    expect(orgActionErrorFromExit(Exit.succeed(undefined))).toBeNull()
  })

  it("unwraps a tagged removal block from a failed exit", () => {
    const result = orgActionErrorFromExit(
      Exit.fail(new LastProjectPmBlocked({ projectSlugs: ["alpha"] }))
    )
    expect(result?.projectSlugs).toEqual(["alpha"])
  })

  it("uses the generic message for defects", () => {
    expect(
      orgActionErrorFromExit(Exit.die(new Error("private failure")))
    ).toEqual(orgActionError(new Forbidden()))
  })
})
