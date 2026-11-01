import * as Layer from "effect/Layer"

import * as ProjectDetails from "./ProjectDetails"
import * as ProjectGithub from "./ProjectGithub"
import * as ProjectMembers from "./ProjectMembers"
import * as Projects from "./Projects"

export const layer = Layer.mergeAll(
  Projects.layer,
  ProjectGithub.layer,
  ProjectMembers.layer
).pipe(Layer.provide(ProjectDetails.layer))
