import { Org } from "@pp/access/roles"
import { describe, expect, it } from "vitest"

import { isClosedAuthPath, orgRoles, requireSingleOrgRole } from "./orgAccess"

const allows = (
  role: Org.OrgRoleName,
  request: Readonly<Record<string, ReadonlyArray<string>>>
) => orgRoles[role].authorize(request).success

describe("Better Auth org roles", () => {
  it.each(Org.OrgRoleName.literals)(
    "hands Better Auth exactly the %s grants from @pp/access",
    (role) => {
      expect(orgRoles[role].statements).toStrictEqual(
        Object.fromEntries(
          Object.entries(Org.orgRoles[role].grants).map(
            ([resource, actions]) => [resource, actions ?? []]
          )
        )
      )
    }
  )

  it("grants Better Auth's own member and invitation checks per role", () => {
    expect(allows("admin", { member: ["update", "delete"] })).toBe(true)
    expect(allows("admin", { organization: ["delete"] })).toBe(false)
    expect(allows("owner", { organization: ["delete"] })).toBe(true)
    expect(allows("member", { invitation: ["create"] })).toBe(false)
    expect(allows("guest", { member: ["read"] })).toBe(false)
  })

  it("accepts exactly one known role", () => {
    expect(requireSingleOrgRole("guest")).toBe("guest")
    expect(() => requireSingleOrgRole("admin,member")).toThrow()
    expect(() => requireSingleOrgRole("")).toThrow()
    expect(() => requireSingleOrgRole("billing")).toThrow()
  })

  it("closes Better Auth's organization endpoints and nothing else", () => {
    expect(isClosedAuthPath("/api/auth/organization/leave")).toBe(true)
    expect(isClosedAuthPath("/api/auth/organization/set-active")).toBe(true)
    expect(isClosedAuthPath("/api/auth/organization")).toBe(true)
    expect(isClosedAuthPath("/api/auth/get-session")).toBe(false)
    expect(isClosedAuthPath("/api/auth/organizations-overview")).toBe(false)
  })
})
