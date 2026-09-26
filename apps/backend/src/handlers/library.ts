import { Library } from "@pp/server-core/library/Library"
import { AppApi } from "@pp/shared"
import * as Effect from "effect/Effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"

import { dieOnMarkdown } from "./lib"

export const LibraryHandlerLive = HttpApiBuilder.group(
  AppApi,
  "library",
  (handlers) =>
    handlers
      .handle("org", () =>
        Effect.flatMap(Library, (library) => library.orgLibrary()).pipe(
          dieOnMarkdown
        )
      )
      .handle("project", () =>
        Effect.flatMap(Library, (library) => library.projectLibrary()).pipe(
          dieOnMarkdown
        )
      )
      .handle("createOrgBlock", ({ payload }) =>
        Effect.flatMap(Library, (library) =>
          library.createOrgBlock(payload)
        ).pipe(dieOnMarkdown)
      )
      .handle("updateOrgBlock", ({ params, payload }) =>
        Effect.flatMap(Library, (library) =>
          library.updateOrgBlock(params.key, payload)
        ).pipe(dieOnMarkdown)
      )
      .handle("removeOrgBlock", ({ params }) =>
        Effect.flatMap(Library, (library) =>
          library.removeOrgBlock(params.key)
        ).pipe(dieOnMarkdown)
      )
      .handle("createOrgTemplate", ({ payload }) =>
        Effect.flatMap(Library, (library) =>
          library.createOrgTemplate(payload)
        ).pipe(dieOnMarkdown)
      )
      .handle("updateOrgTemplate", ({ params, payload }) =>
        Effect.flatMap(Library, (library) =>
          library.updateOrgTemplate(params.key, payload)
        ).pipe(dieOnMarkdown)
      )
      .handle("removeOrgTemplate", ({ params }) =>
        Effect.flatMap(Library, (library) =>
          library.removeOrgTemplate(params.key)
        ).pipe(dieOnMarkdown)
      )
      .handle("createProjectBlock", ({ payload }) =>
        Effect.flatMap(Library, (library) => library.createBlock(payload)).pipe(
          dieOnMarkdown
        )
      )
      .handle("updateProjectBlock", ({ params, payload }) =>
        Effect.flatMap(Library, (library) =>
          library.updateBlock(params.key, payload)
        ).pipe(dieOnMarkdown)
      )
      .handle("removeProjectBlock", ({ params }) =>
        Effect.flatMap(Library, (library) =>
          library.removeBlock(params.key)
        ).pipe(dieOnMarkdown)
      )
      .handle("hideProjectBlock", ({ params }) =>
        Effect.flatMap(Library, (library) =>
          library.hideBlock(params.key)
        ).pipe(dieOnMarkdown)
      )
      .handle("createProjectTemplate", ({ payload }) =>
        Effect.flatMap(Library, (library) =>
          library.createTemplate(payload)
        ).pipe(dieOnMarkdown)
      )
      .handle("updateProjectTemplate", ({ params, payload }) =>
        Effect.flatMap(Library, (library) =>
          library.updateTemplate(params.key, payload)
        ).pipe(dieOnMarkdown)
      )
      .handle("removeProjectTemplate", ({ params }) =>
        Effect.flatMap(Library, (library) =>
          library.removeTemplate(params.key)
        ).pipe(dieOnMarkdown)
      )
      .handle("hideProjectTemplate", ({ params }) =>
        Effect.flatMap(Library, (library) =>
          library.hideTemplate(params.key)
        ).pipe(dieOnMarkdown)
      )
      .handle("setOrgTemplateDefaults", ({ payload }) =>
        Effect.flatMap(Library, (library) =>
          library.setOrgTemplateDefaults(payload)
        ).pipe(dieOnMarkdown)
      )
      .handle("setTemplateDefaults", ({ payload }) =>
        Effect.flatMap(Library, (library) =>
          library.setTemplateDefaults(payload)
        ).pipe(dieOnMarkdown)
      )
)
