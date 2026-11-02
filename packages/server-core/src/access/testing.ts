import { Effective, Org } from "@pp/access/roles"
import {
  NotFound,
  OrgScope,
  type OrgRole,
  type ProjectScope,
  type Role,
  User
} from "@pp/shared"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"

import * as Access from "./Access"

const decodeUser = Schema.decodeSync(User)

export const testUser = (id: string) =>
  decodeUser({
    id,
    email: `${id}@example.test`,
    name: id,
    username: null,
    image: null,
    createdAt: "2026-09-25T00:00:00Z",
    activeOrgSlug: null,
    personalGithub: { connected: false },
    editorPreference: "github",
    personalEverhour: {
      connected: false,
      everhourUserId: null,
      name: null,
      email: null,
      lastVerifiedAt: null,
      lastCheckError: null
    }
  })

export const orgScope = (
  role: OrgRole,
  overrides: Partial<Omit<OrgScope["Service"], "role" | "permissions">> = {}
): OrgScope["Service"] => ({
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
    Omit<ProjectScope["Service"], "orgRole" | "role" | "permissions">
  > = {}
): ProjectScope["Service"] => ({
  userId: "user-1",
  organizationId: "org-1",
  orgSlug: "acme",
  projectId: "00000000-0000-4000-8000-000000000001",
  slug: "website",
  ...overrides,
  orgRole,
  role,
  permissions: Option.getOrThrow(Effective.roleOnProject(orgRole, role))
})

export const accessLayer = (
  scopes: Readonly<{
    org?: OrgScope["Service"]
    projects?: ReadonlyArray<ProjectScope["Service"]>
  }>
) =>
  Layer.succeed(Access.Access, {
    org: (orgSlug, lookup) =>
      scopes.org?.orgSlug === orgSlug &&
      (scopes.org.deletedAt === null || lookup?.includeDeleted === true)
        ? Effect.succeed(scopes.org)
        : Effect.fail(new NotFound()),
    project: (orgSlug, slug) => {
      const found = scopes.projects?.find(
        (scope) => scope.orgSlug === orgSlug && scope.slug === slug
      )
      return found ? Effect.succeed(found) : Effect.fail(new NotFound())
    },
    projectsInOrg: () =>
      Effect.map(OrgScope, (org) =>
        (scopes.projects ?? []).filter(
          (scope) => scope.organizationId === org.organizationId
        )
      ),
    projectById: (projectId) =>
      Effect.map(OrgScope, (org) =>
        Option.fromUndefinedOr(
          scopes.projects?.find(
            (scope) =>
              scope.organizationId === org.organizationId &&
              scope.projectId === projectId
          )
        )
      )
  })
