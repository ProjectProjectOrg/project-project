import { Org } from "@pp/access/roles"
import { APIError } from "better-auth/api"
import { createAccessControl } from "better-auth/plugins/access"
import * as Option from "effect/Option"
import * as Record from "effect/Record"
import * as Schema from "effect/Schema"

type Grants = Readonly<Record<string, ReadonlyArray<string> | undefined>>

const statements = (grants: Grants) =>
  Record.map(grants, (actions) => actions ?? [])

export const orgAccessControl = createAccessControl(
  statements(Org.orgStatement.all)
)

export const orgRoles = Record.map(Org.orgRoles, (role) =>
  orgAccessControl.newRole(statements(role.grants))
)

const decodeOrgRole = Schema.decodeUnknownOption(Org.OrgRoleName)

export const requireSingleOrgRole = (role: string) =>
  Option.getOrThrowWith(
    decodeOrgRole(role),
    () =>
      new APIError("BAD_REQUEST", {
        code: "ROLE_NOT_FOUND",
        message: "A member has exactly one organization role"
      })
  )

export const isClosedAuthPath = (pathname: string) =>
  pathname === "/api/auth/organization" ||
  pathname.startsWith("/api/auth/organization/")
