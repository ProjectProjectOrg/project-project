import { Conflict, LastProjectPmBlocked, Validation } from "@pp/shared"
import * as Exit from "effect/Exit"
import { describe, expect, it } from "vitest"

import { orgActionError, orgActionErrorFromExit } from "./orgErrors"

describe("orgActionError", () => {
  it("surfaces project slugs for a blocked owner removal", () => {
    const result = orgActionError({
      code: "LAST_PROJECT_PM_BLOCKED",
      projectSlugs: ["alpha", "beta"]
    })
    expect(result.projectSlugs).toEqual(["alpha", "beta"])
  })

  it("maps distinct error codes to distinct messages", () => {
    const alreadyMember = orgActionError({
      code: "USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION"
    })
    const alreadyInvited = orgActionError({
      code: "USER_IS_ALREADY_INVITED_TO_THIS_ORGANIZATION"
    })
    const lastOwner = orgActionError({ code: "LAST_ORG_OWNER_BLOCKED" })
    const onlyOwnerLeave = orgActionError({
      code: "YOU_CANNOT_LEAVE_THE_ORGANIZATION_AS_THE_ONLY_OWNER"
    })

    const messages = [
      alreadyMember.message,
      alreadyInvited.message,
      lastOwner.message,
      onlyOwnerLeave.message
    ]
    expect(new Set(messages).size).toBe(messages.length)
    for (const message of messages) expect(message.length).toBeGreaterThan(0)
  })

  it("maps the tagged errors the org endpoints return", () => {
    const generic = orgActionError({ code: "SOMETHING_UNEXPECTED" }).message
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
    expect(result.message).not.toBe(
      orgActionError({ code: "SOMETHING_UNEXPECTED" }).message
    )
  })

  it("unwraps a tagged removal block from a failed exit", () => {
    const result = orgActionErrorFromExit(
      Exit.fail(new LastProjectPmBlocked({ projectSlugs: ["alpha"] }))
    )
    expect(result?.projectSlugs).toEqual(["alpha"])
  })

  it("falls back to a generic message for unknown causes", () => {
    const result = orgActionError({ code: "SOMETHING_UNEXPECTED" })
    expect(result.message.length).toBeGreaterThan(0)
    expect(result.projectSlugs).toBeUndefined()
  })
})

describe("orgActionErrorFromExit", () => {
  it("returns null for a successful exit", () => {
    expect(orgActionErrorFromExit(Exit.succeed(undefined))).toBeNull()
  })

  it("unwraps a wrapped better-auth error (UnknownException shape)", () => {
    const exit = Exit.fail({
      _tag: "UnknownException",
      error: { code: "LAST_PROJECT_PM_BLOCKED", projectSlugs: ["x"] }
    })
    const result = orgActionErrorFromExit(exit)
    expect(result?.projectSlugs).toEqual(["x"])
  })

  it("reads a directly-failed better-auth error", () => {
    const exit = Exit.fail({
      code: "YOU_CANNOT_LEAVE_THE_ORGANIZATION_AS_THE_ONLY_OWNER"
    })
    const direct = orgActionErrorFromExit(exit)
    const expected = orgActionError({
      code: "YOU_CANNOT_LEAVE_THE_ORGANIZATION_AS_THE_ONLY_OWNER"
    })
    expect(direct?.message).toBe(expected.message)
  })
})
