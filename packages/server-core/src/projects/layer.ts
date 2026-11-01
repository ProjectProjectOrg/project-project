import * as Layer from "effect/Layer"

import * as ProjectDetails from "./ProjectDetails"
import * as ProjectGithub from "./ProjectGithub"
import * as ProjectMembers from "./ProjectMembers"
import { ProjectsLive } from "./ProjectsLive"

export const layer = Layer.mergeAll(
  ProjectsLive,
  ProjectGithub.layer,
  ProjectMembers.layer
).pipe(Layer.provide(ProjectDetails.layer))
