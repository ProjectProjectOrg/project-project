import type {
  BlockDefinition,
  BlockKey,
  CreateBlockInput,
  CreateTypeInput,
  Library,
  TypeDefinition,
  TypeKey,
  UpdateBlockInput,
  UpdateTypeInput
} from "@pp/shared"
import type * as Effect from "effect/Effect"
import * as Atom from "effect/reactivity/Atom"

import { Api } from "@/api/Api"
import { Keys, projectScope, type ReactivityKey } from "@/api/keys"
import { query } from "@/api/query"
import { viewMutation, type OptimisticView } from "@/api/viewMutation"

import {
  applyBlockCreate,
  applyBlockHide,
  applyBlockRemove,
  applyBlockUpdate,
  applyBlockUpsert,
  applyTypeCreate,
  applyTypeHide,
  applyTypeRemove,
  applyTypeUpdate,
  applyTypeUpsert
} from "../lib/libraryPatch"

export type OrgLibraryRequest = Readonly<{
  _view: "orgLibrary"
  params: Readonly<{ orgSlug: string }>
}>

export type ProjectLibraryRequest = Readonly<{
  _view: "projectLibrary"
  params: Readonly<{ orgSlug: string; slug: string }>
}>

export const orgLibraryRequest = (orgSlug: string): OrgLibraryRequest => ({
  _view: "orgLibrary",
  params: { orgSlug }
})

export const projectLibraryRequest = (
  orgSlug: string,
  slug: string
): ProjectLibraryRequest => ({
  _view: "projectLibrary",
  params: { orgSlug, slug }
})

const scopeOf = (req: ProjectLibraryRequest) =>
  projectScope(req.params.orgSlug, req.params.slug)

const orgLibraryQuery = (req: OrgLibraryRequest) =>
  query("library", "org", {
    params: req.params,
    timeToLive: "5 minutes",
    reactivityKeys: [Keys.orgLibrary(req.params.orgSlug)]
  })

const projectLibraryQuery = (req: ProjectLibraryRequest) =>
  query("library", "project", {
    params: req.params,
    timeToLive: "5 minutes",
    reactivityKeys: [
      Keys.orgLibrary(req.params.orgSlug),
      Keys.projectLibrary(scopeOf(req))
    ]
  })

export const orgLibraryFor = Atom.family((req: OrgLibraryRequest) =>
  Atom.optimistic(orgLibraryQuery(req))
)

export const projectLibraryFor = Atom.family((req: ProjectLibraryRequest) =>
  Atom.optimistic(projectLibraryQuery(req))
)

type LibraryTarget<E> = Readonly<{
  view: OptimisticView<Library, E>
  publish: ReadonlyArray<ReactivityKey>
}>

const orgTarget = (req: OrgLibraryRequest) => ({
  view: orgLibraryFor(req),
  publish: [Keys.orgLibrary(req.params.orgSlug)]
})

const projectTarget = (req: ProjectLibraryRequest) => ({
  view: projectLibraryFor(req),
  publish: [Keys.projectLibrary(scopeOf(req))]
})

const libraryMutation = <Input, A, E, ViewError>(
  name: string,
  target: LibraryTarget<ViewError>,
  predict: (library: Library, input: Input) => Library,
  call: (input: Input) => Effect.Effect<A, E, Api>,
  confirm: (library: Library, confirmed: A, input: Input) => Library
) =>
  viewMutation(target.view, {
    name,
    predict,
    call: (_client, input) => call(input),
    confirm,
    publish: () => target.publish
  })

type OrgKeyed<Key> = Readonly<{ req: OrgLibraryRequest; key: Key }>
type ProjectKeyed<Key> = Readonly<{ req: ProjectLibraryRequest; key: Key }>

const upsertBlock = (library: Library, block: BlockDefinition) =>
  applyBlockUpsert(library, block)

const upsertType = (library: Library, template: TypeDefinition) =>
  applyTypeUpsert(library, template)

export const createOrgBlock = Atom.family(
  ({ req }: Readonly<{ req: OrgLibraryRequest }>) =>
    libraryMutation(
      "createOrgBlock",
      orgTarget(req),
      (library, input: CreateBlockInput) =>
        applyBlockCreate(library, input, "org"),
      (input) =>
        Api.use((client) =>
          client.library.createOrgBlock({ params: req.params, payload: input })
        ),
      upsertBlock
    )
)

export const updateOrgBlock = Atom.family(({ req, key }: OrgKeyed<BlockKey>) =>
  libraryMutation(
    "updateOrgBlock",
    orgTarget(req),
    (library, patch: UpdateBlockInput) => applyBlockUpdate(library, key, patch),
    (patch) =>
      Api.use((client) =>
        client.library.updateOrgBlock({
          params: { ...req.params, key },
          payload: patch
        })
      ),
    upsertBlock
  )
)

export const updateOrgBlockFromProject = Atom.family(
  ({ req, key }: ProjectKeyed<BlockKey>) =>
    libraryMutation(
      "updateOrgBlockFromProject",
      {
        view: projectLibraryFor(req),
        publish: [Keys.orgLibrary(req.params.orgSlug)]
      },
      (library, patch: UpdateBlockInput) =>
        applyBlockUpdate(library, key, patch),
      (patch) =>
        Api.use((client) =>
          client.library.updateOrgBlock({
            params: { orgSlug: req.params.orgSlug, key },
            payload: patch
          })
        ),
      upsertBlock
    )
)

export const removeOrgBlock = Atom.family(({ req, key }: OrgKeyed<BlockKey>) =>
  libraryMutation(
    "removeOrgBlock",
    orgTarget(req),
    (library, _input: void) => applyBlockRemove(library, key, "org"),
    () =>
      Api.use((client) =>
        client.library.removeOrgBlock({ params: { ...req.params, key } })
      ),
    (library) => applyBlockRemove(library, key, "org")
  )
)

export const createOrgType = Atom.family(
  ({ req }: Readonly<{ req: OrgLibraryRequest }>) =>
    libraryMutation(
      "createOrgType",
      orgTarget(req),
      (library, input: CreateTypeInput) =>
        applyTypeCreate(library, input, "org"),
      (input) =>
        Api.use((client) =>
          client.library.createOrgType({
            params: req.params,
            payload: input
          })
        ),
      upsertType
    )
)

export const updateOrgType = Atom.family(({ req, key }: OrgKeyed<TypeKey>) =>
  libraryMutation(
    "updateOrgType",
    orgTarget(req),
    (library, patch: UpdateTypeInput) => applyTypeUpdate(library, key, patch),
    (patch) =>
      Api.use((client) =>
        client.library.updateOrgType({
          params: { ...req.params, key },
          payload: patch
        })
      ),
    upsertType
  )
)

export const removeOrgType = Atom.family(({ req, key }: OrgKeyed<TypeKey>) =>
  libraryMutation(
    "removeOrgType",
    orgTarget(req),
    (library, _input: void) => applyTypeRemove(library, key, "org"),
    () =>
      Api.use((client) =>
        client.library.removeOrgType({ params: { ...req.params, key } })
      ),
    (library) => applyTypeRemove(library, key, "org")
  )
)

export const createProjectBlock = Atom.family(
  ({ req }: Readonly<{ req: ProjectLibraryRequest }>) =>
    libraryMutation(
      "createProjectBlock",
      projectTarget(req),
      (library, input: CreateBlockInput) =>
        applyBlockCreate(library, input, "project"),
      (input) =>
        Api.use((client) =>
          client.library.createProjectBlock({
            params: req.params,
            payload: input
          })
        ),
      upsertBlock
    )
)

export const updateProjectBlock = Atom.family(
  ({ req, key }: ProjectKeyed<BlockKey>) =>
    libraryMutation(
      "updateProjectBlock",
      projectTarget(req),
      (library, patch: UpdateBlockInput) =>
        applyBlockUpdate(library, key, patch),
      (patch) =>
        Api.use((client) =>
          client.library.updateProjectBlock({
            params: { ...req.params, key },
            payload: patch
          })
        ),
      upsertBlock
    )
)

export const removeProjectBlock = Atom.family(
  ({ req, key }: ProjectKeyed<BlockKey>) =>
    libraryMutation(
      "removeProjectBlock",
      projectTarget(req),
      (library, _input: void) => applyBlockRemove(library, key, "project"),
      () =>
        Api.use((client) =>
          client.library.removeProjectBlock({ params: { ...req.params, key } })
        ),
      (library) => applyBlockRemove(library, key, "project")
    )
)

export const hideProjectBlock = Atom.family(
  ({ req, key }: ProjectKeyed<BlockKey>) =>
    libraryMutation(
      "hideProjectBlock",
      projectTarget(req),
      (library, _input: void) => applyBlockHide(library, key),
      () =>
        Api.use((client) =>
          client.library.hideProjectBlock({ params: { ...req.params, key } })
        ),
      (library) => applyBlockHide(library, key)
    )
)

export const createProjectType = Atom.family(
  ({ req }: Readonly<{ req: ProjectLibraryRequest }>) =>
    libraryMutation(
      "createProjectType",
      projectTarget(req),
      (library, input: CreateTypeInput) =>
        applyTypeCreate(library, input, "project"),
      (input) =>
        Api.use((client) =>
          client.library.createProjectType({
            params: req.params,
            payload: input
          })
        ),
      upsertType
    )
)

export const updateProjectType = Atom.family(
  ({ req, key }: ProjectKeyed<TypeKey>) =>
    libraryMutation(
      "updateProjectType",
      projectTarget(req),
      (library, patch: UpdateTypeInput) => applyTypeUpdate(library, key, patch),
      (patch) =>
        Api.use((client) =>
          client.library.updateProjectType({
            params: { ...req.params, key },
            payload: patch
          })
        ),
      upsertType
    )
)

export const removeProjectType = Atom.family(
  ({ req, key }: ProjectKeyed<TypeKey>) =>
    libraryMutation(
      "removeProjectType",
      projectTarget(req),
      (library, _input: void) => applyTypeRemove(library, key, "project"),
      () =>
        Api.use((client) =>
          client.library.removeProjectType({
            params: { ...req.params, key }
          })
        ),
      (library) => applyTypeRemove(library, key, "project")
    )
)

export const hideProjectType = Atom.family(
  ({ req, key }: ProjectKeyed<TypeKey>) =>
    libraryMutation(
      "hideProjectType",
      projectTarget(req),
      (library, _input: void) => applyTypeHide(library, key),
      () =>
        Api.use((client) =>
          client.library.hideProjectType({ params: { ...req.params, key } })
        ),
      (library) => applyTypeHide(library, key)
    )
)
