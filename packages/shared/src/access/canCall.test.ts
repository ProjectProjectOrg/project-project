import { Effective } from "@pp/access/roles"
import * as Option from "effect/Option"
import { describe, expect, it } from "vitest"

import { canCallOrg, canCallProject } from "./canCall"

const project = (
  orgRole: "owner" | "admin" | "member" | "guest",
  role: "pm" | "developer" | "client" | null
) =>
  canCallProject(
    Option.getOrThrow(Effective.roleOnProject(orgRole, role)).grants
  )

describe("canCallProject", () => {
  it("answers from each endpoint's own requirement", () => {
    expect(project("member", "pm")("tickets", "delete")).toBe(true)
    expect(project("member", "developer")("tickets", "delete")).toBe(false)
    expect(project("member", "developer")("projects", "connectGithub")).toBe(
      true
    )
    expect(project("guest", "client")("projects", "connectGithub")).toBe(false)
    expect(project("guest", "client")("tickets", "create")).toBe(true)
  })

  it("lets an org admin without a project role read but not write", () => {
    const admin = project("admin", null)
    expect(admin("tickets", "list")).toBe(true)
    expect(admin("tickets", "create")).toBe(false)
    expect(admin("projects", "addMember")).toBe(true)
  })

  it("never allows an endpoint that isn't scoped to a project", () => {
    expect(project("owner", "pm")("org", "rename")).toBe(false)
  })
})

describe("canCallOrg", () => {
  it("answers from the org role", () => {
    expect(canCallOrg("admin")("org", "rename")).toBe(true)
    expect(canCallOrg("member")("org", "rename")).toBe(false)
    expect(canCallOrg("guest")("org", "members")).toBe(false)
    expect(canCallOrg("guest")("org", "leave")).toBe(true)
  })
})
