import type { ProjectResources } from "../roles/project"
import type * as Statement from "../Statement"

export type ProjectActor = Readonly<{
  userId: string
  permissions: Statement.Role<ProjectResources>
}>
