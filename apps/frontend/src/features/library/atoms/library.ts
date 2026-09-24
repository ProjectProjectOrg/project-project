import type {
  BlockDefinition,
  BlockKey,
  CreateBlockInput,
  Library,
  UpdateBlockInput
} from "@pp/shared"
import * as Effect from "effect/Effect"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import * as Atom from "effect/unstable/reactivity/Atom"
import * as Reactivity from "effect/unstable/reactivity/Reactivity"

import { Api } from "@/api/Api"
import { Keys, projectScope } from "@/api/keys"

import {
  applyBlockCreate,
  applyBlockHide,
  applyBlockRemove,
  applyBlockUpdate,
  applyBlockUpsert
} from "../libraryPatch"

export type OrgLibraryRequest = Readonly<{
  params: Readonly<{ orgSlug: string }>
}>

export type ProjectLibraryRequest = Readonly<{
  params: Readonly<{ orgSlug: string; slug: string }>
}>

export const orgLibraryRequest = (orgSlug: string): OrgLibraryRequest => ({
  params: { orgSlug }
})

export const projectLibraryRequest = (
  orgSlug: string,
  slug: string
): ProjectLibraryRequest => ({ params: { orgSlug, slug } })

const scopeOf = (req: ProjectLibraryRequest) =>
  projectScope(req.params.orgSlug, req.params.slug)

const orgLibraryQuery = (req: OrgLibraryRequest) =>
  Api.query("library", "org", {
    params: req.params,
    timeToLive: "5 minutes",
    reactivityKeys: [Keys.orgLibrary(req.params.orgSlug)]
  })

const projectLibraryQuery = (req: ProjectLibraryRequest) =>
  Api.query("library", "project", {
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

type LibraryView = ReturnType<typeof orgLibraryFor>

type LibraryTarget = Readonly<{
  view: LibraryView
  publish: ReadonlyArray<string>
}>

const orgTarget = (req: OrgLibraryRequest): LibraryTarget => ({
  view: orgLibraryFor(req),
  publish: [Keys.orgLibrary(req.params.orgSlug)]
})

const projectTarget = (req: ProjectLibraryRequest): LibraryTarget => ({
  view: projectLibraryFor(req),
  publish: [Keys.projectLibrary(scopeOf(req))]
})

const libraryMutation = <Input, A, E>(
  name: string,
  target: LibraryTarget,
  predict: (library: Library, input: Input) => Library,
  call: (input: Input) => Effect.Effect<A, E, Api>,
  confirm: (library: Library, confirmed: A, input: Input) => Library
) =>
  Atom.optimisticFn(target.view, {
    reducer: (current, input: Input) =>
      AsyncResult.map(current, (library) => predict(library, input)),
    fn: (set) =>
      Api.runtime.fn(
        Effect.fn(name)(function* (input: Input, get) {
          const confirmed = yield* call(input)
          set(
            AsyncResult.map(get(target.view), (library) =>
              confirm(library, confirmed, input)
            )
          )
          yield* Reactivity.invalidate(target.publish)
          return confirmed
        })
      )
  })

type OrgKeyed<Key> = Readonly<{ req: OrgLibraryRequest; key: Key }>
type ProjectKeyed<Key> = Readonly<{ req: ProjectLibraryRequest; key: Key }>

const upsertBlock = (library: Library, block: BlockDefinition) =>
  applyBlockUpsert(library, block)

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
