import * as Library from "@pp/server-core/library/Library"
import { AppApi } from "@pp/shared"
import * as Effect from "effect/Effect"
import { HttpApiBuilder } from "effect/http-api"

import { dieOnMarkdown } from "../http/dieOnMarkdown"

export const LibraryHandlerLive = HttpApiBuilder.group(
  AppApi,
  "library",
  (handlers) =>
    handlers
      .handle("org", () =>
        Effect.flatMap(Library.Library, (library) => library.orgLibrary()).pipe(
          dieOnMarkdown
        )
      )
      .handle("project", () =>
        Effect.flatMap(Library.Library, (library) =>
          library.projectLibrary()
        ).pipe(dieOnMarkdown)
      )
      .handle("createOrgBlock", ({ payload }) =>
        Effect.flatMap(Library.Library, (library) =>
          library.createOrgBlock(payload)
        ).pipe(dieOnMarkdown)
      )
      .handle("updateOrgBlock", ({ params, payload }) =>
        Effect.flatMap(Library.Library, (library) =>
          library.updateOrgBlock(params.key, payload)
        ).pipe(dieOnMarkdown)
      )
      .handle("removeOrgBlock", ({ params }) =>
        Effect.flatMap(Library.Library, (library) =>
          library.removeOrgBlock(params.key)
        ).pipe(dieOnMarkdown)
      )
      .handle("createOrgType", ({ payload }) =>
        Effect.flatMap(Library.Library, (library) =>
          library.createOrgType(payload)
        ).pipe(dieOnMarkdown)
      )
      .handle("updateOrgType", ({ params, payload }) =>
        Effect.flatMap(Library.Library, (library) =>
          library.updateOrgType(params.key, payload)
        ).pipe(dieOnMarkdown)
      )
      .handle("removeOrgType", ({ params }) =>
        Effect.flatMap(Library.Library, (library) =>
          library.removeOrgType(params.key)
        ).pipe(dieOnMarkdown)
      )
      .handle("createProjectBlock", ({ payload }) =>
        Effect.flatMap(Library.Library, (library) =>
          library.createBlock(payload)
        ).pipe(dieOnMarkdown)
      )
      .handle("updateProjectBlock", ({ params, payload }) =>
        Effect.flatMap(Library.Library, (library) =>
          library.updateBlock(params.key, payload)
        ).pipe(dieOnMarkdown)
      )
      .handle("removeProjectBlock", ({ params }) =>
        Effect.flatMap(Library.Library, (library) =>
          library.removeBlock(params.key)
        ).pipe(dieOnMarkdown)
      )
      .handle("hideProjectBlock", ({ params }) =>
        Effect.flatMap(Library.Library, (library) =>
          library.hideBlock(params.key)
        ).pipe(dieOnMarkdown)
      )
      .handle("createProjectType", ({ payload }) =>
        Effect.flatMap(Library.Library, (library) =>
          library.createType(payload)
        ).pipe(dieOnMarkdown)
      )
      .handle("updateProjectType", ({ params, payload }) =>
        Effect.flatMap(Library.Library, (library) =>
          library.updateType(params.key, payload)
        ).pipe(dieOnMarkdown)
      )
      .handle("removeProjectType", ({ params }) =>
        Effect.flatMap(Library.Library, (library) =>
          library.removeType(params.key)
        ).pipe(dieOnMarkdown)
      )
      .handle("hideProjectType", ({ params }) =>
        Effect.flatMap(Library.Library, (library) =>
          library.hideType(params.key)
        ).pipe(dieOnMarkdown)
      )
)
