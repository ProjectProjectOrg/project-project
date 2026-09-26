import { Effective, Org } from "@pp/access/roles"
import {
  NotFound,
  type OrgRole,
  type OrgScopeShape,
  type ProjectScopeShape,
  type Role
} from "@pp/shared"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"

import { Access } from "./Access"

export const orgScope = (
  role: OrgRole,
  overrides: Partial<Omit<OrgScopeShape, "role" | "permissions">> = {}
): OrgScopeShape => ({
  userId: "user-1",
  organizationId: "org-1",
  orgSlug: "acme",
  deletedAt: null,
  ...overrides,
  role,
  permissions: Org.orgRoles[role]
})

export const projectScope = (
  orgRole: OrgRole,
  role: Role | null,
  overrides: Partial<
    Omit<ProjectScopeShape, "orgRole" | "role" | "permissions">
  > = {}
): ProjectScopeShape => ({
  userId: "user-1",
  organizationId: "org-1",
  orgSlug: "acme",
  projectId: "00000000-0000-4000-8000-000000000001",
  slug: "website",
  ...overrides,
  orgRole,
  role,
  permissions: Option.getOrThrow(Effective.projectPermissions(orgRole, role))
})

export const accessLayer = (
  scopes: Readonly<{ org?: OrgScopeShape; project?: ProjectScopeShape }>
) =>
  Layer.succeed(Access, {
    org: (orgSlug, lookup) =>
      scopes.org?.orgSlug === orgSlug &&
      (scopes.org.deletedAt === null || lookup?.includeDeleted === true)
        ? Effect.succeed(scopes.org)
        : Effect.fail(new NotFound()),
    project: (orgSlug, slug) =>
      scopes.project?.orgSlug === orgSlug && scopes.project.slug === slug
        ? Effect.succeed(scopes.project)
        : Effect.fail(new NotFound())
  })
