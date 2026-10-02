import type { Project } from "@pp/access/roles"
import * as Context from "effect/Context"
import { HttpApiMiddleware } from "effect/unstable/httpapi"

import type { CurrentUser } from "../Authentication"
import { Forbidden, NotFound } from "../errors"
import type { ProjectScope } from "./ProjectScope"
import type { Requirement } from "./Requirement"

export type ProjectRequirement = Requirement<Project.ProjectResources>

export class RequiresProject extends Context.Service<
  RequiresProject,
  ProjectRequirement
>()("@pp/shared/access/ProjectAccess/RequiresProject") {}

export class ProjectAccess extends HttpApiMiddleware.Service<
  ProjectAccess,
  {
    requires: CurrentUser
    provides: ProjectScope
  }
>()("@pp/shared/access/ProjectAccess", {
  error: [NotFound, Forbidden]
}) {}
