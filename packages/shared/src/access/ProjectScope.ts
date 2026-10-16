import type { Statement } from "@pp/access"
import type { Project } from "@pp/access/roles"
import * as Context from "effect/Context"

import type { OrgRole } from "../schemas/Org"
import type { Role } from "../schemas/Project"

export type ProjectScopeShape = Readonly<{
  userId: string
  organizationId: string
  orgSlug: string
  orgRole: OrgRole
  projectId: string
  slug: string
  role: Role | null
  permissions: Statement.Role<Project.ProjectResources>
}>

/** @effect-leakable-service */
export class ProjectScope extends Context.Service<
  ProjectScope,
  ProjectScopeShape
>()("@pp/shared/access/ProjectScope") {}
