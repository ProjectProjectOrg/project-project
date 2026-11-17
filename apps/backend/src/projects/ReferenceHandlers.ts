import * as ProjectReferences from "@pp/server-core/projects/ProjectReferences"
import { AppApi } from "@pp/shared"
import * as Effect from "effect/Effect"
import { HttpApiBuilder } from "effect/http-api"

import { dieOnMarkdown } from "../http/dieOnMarkdown"

export const ProjectReferencesHandlerLive = HttpApiBuilder.group(
  AppApi,
  "projectReferences",
  (handlers) =>
    handlers
      .handle("list", () =>
        Effect.flatMap(ProjectReferences.ProjectReferences, (references) =>
          references.list()
        ).pipe(dieOnMarkdown)
      )
      .handle("fix", ({ payload }) =>
        Effect.flatMap(ProjectReferences.ProjectReferences, (references) =>
          references.fix(payload)
        ).pipe(dieOnMarkdown)
      )
)
