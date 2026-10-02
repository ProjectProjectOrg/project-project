import type { ProjectResources } from "../roles/project"
import type * as Statement from "../Statement"

export type PolicyActor = Readonly<{
  userId: string
  permissions: Statement.Role<ProjectResources>
}>
