import { Library, type LibraryShape } from "@pp/server-core/library/Library"
import { CurrentOrg } from "@pp/server-core/organizations/CurrentOrg"
import { AppApi, CurrentUser } from "@pp/shared"
import * as Effect from "effect/Effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"

import { dieOnMarkdown } from "./lib"

type OrgParams = Readonly<{ orgSlug: string }>
type ProjectParams = Readonly<{ orgSlug: string; slug: string }>

const slugOf = (params: OrgParams | ProjectParams): string | null =>
  "slug" in params ? params.slug : null

const withLibrary = <A, E, R>(
  params: OrgParams | ProjectParams,
  run: (
    library: LibraryShape,
    orgSlug: string,
    userId: string,
    slug: string | null
  ) => Effect.Effect<A, E, R>
) =>
  Effect.gen(function* () {
    const user = yield* CurrentUser
    const currentOrg = yield* CurrentOrg
    const org = yield* currentOrg.resolve(params.orgSlug, user.id)
    const library = yield* Library
    return yield* run(library, org.orgSlug, user.id, slugOf(params)).pipe(
      dieOnMarkdown
    )
  })

export const LibraryHandlerLive = HttpApiBuilder.group(
  AppApi,
  "library",
  (handlers) =>
    handlers
      .handle("org", ({ params }) =>
        withLibrary(params, (library, org, user) =>
          library.orgLibrary(org, user)
        )
      )
      .handle("project", ({ params }) =>
        withLibrary(params, (library, org, user) =>
          library.projectLibrary(org, user, params.slug)
        )
      )
      .handle("createOrgBlock", ({ params, payload }) =>
        withLibrary(params, (library, org, user, slug) =>
          library.createBlock(org, user, slug, payload)
        )
      )
      .handle("updateOrgBlock", ({ params, payload }) =>
        withLibrary(params, (library, org, user, slug) =>
          library.updateBlock(org, user, slug, params.key, payload)
        )
      )
      .handle("removeOrgBlock", ({ params }) =>
        withLibrary(params, (library, org, user, slug) =>
          library.removeBlock(org, user, slug, params.key)
        )
      )
      .handle("createOrgTemplate", ({ params, payload }) =>
        withLibrary(params, (library, org, user, slug) =>
          library.createTemplate(org, user, slug, payload)
        )
      )
      .handle("updateOrgTemplate", ({ params, payload }) =>
        withLibrary(params, (library, org, user, slug) =>
          library.updateTemplate(org, user, slug, params.key, payload)
        )
      )
      .handle("removeOrgTemplate", ({ params }) =>
        withLibrary(params, (library, org, user, slug) =>
          library.removeTemplate(org, user, slug, params.key)
        )
      )
      .handle("createProjectBlock", ({ params, payload }) =>
        withLibrary(params, (library, org, user, slug) =>
          library.createBlock(org, user, slug, payload)
        )
      )
      .handle("updateProjectBlock", ({ params, payload }) =>
        withLibrary(params, (library, org, user, slug) =>
          library.updateBlock(org, user, slug, params.key, payload)
        )
      )
      .handle("removeProjectBlock", ({ params }) =>
        withLibrary(params, (library, org, user, slug) =>
          library.removeBlock(org, user, slug, params.key)
        )
      )
      .handle("hideProjectBlock", ({ params }) =>
        withLibrary(params, (library, org, user) =>
          library.hideBlock(org, user, params.slug, params.key)
        )
      )
      .handle("createProjectTemplate", ({ params, payload }) =>
        withLibrary(params, (library, org, user, slug) =>
          library.createTemplate(org, user, slug, payload)
        )
      )
      .handle("updateProjectTemplate", ({ params, payload }) =>
        withLibrary(params, (library, org, user, slug) =>
          library.updateTemplate(org, user, slug, params.key, payload)
        )
      )
      .handle("removeProjectTemplate", ({ params }) =>
        withLibrary(params, (library, org, user, slug) =>
          library.removeTemplate(org, user, slug, params.key)
        )
      )
      .handle("hideProjectTemplate", ({ params }) =>
        withLibrary(params, (library, org, user) =>
          library.hideTemplate(org, user, params.slug, params.key)
        )
      )
      .handle("setOrgTemplateDefaults", ({ params, payload }) =>
        withLibrary(params, (library, org, user) =>
          library.setOrgTemplateDefaults(org, user, payload)
        )
      )
      .handle("setTemplateDefaults", ({ params, payload }) =>
        withLibrary(params, (library, org, user) =>
          library.setTemplateDefaults(org, user, params.slug, payload)
        )
      )
)
