import * as Layer from "effect/Layer"

import * as ProjectDetails from "./ProjectDetails"
import * as ProjectGithub from "./ProjectGithub"
import { ProjectsLive } from "./ProjectsLive"

export const layer = Layer.mergeAll(ProjectsLive, ProjectGithub.layer).pipe(
  Layer.provide(ProjectDetails.layer)
)
