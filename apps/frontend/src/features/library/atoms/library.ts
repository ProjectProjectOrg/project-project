import type {
  BlockDefinition,
  BlockKey,
  CreateBlockInput,
  CreateTemplateInput,
  Library,
  LibraryDefaults,
  TemplateDefinition,
  TemplateKey,
  TicketType,
  UpdateBlockInput,
  UpdateTemplateDefaultsInput,
  UpdateTemplateInput
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
  applyBlockUpsert,
  applyTemplateCreate,
  applyTemplateDefaults,
  applyTemplateHide,
  applyTemplateRemove,
  applyTemplateUpdate,
  applyTemplateUpsert
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

type LibraryView<E> = Atom.Writable<
  AsyncResult.AsyncResult<Library, E>,
  Atom.Atom<
    AsyncResult.AsyncResult<AsyncResult.AsyncResult<Library, E>, unknown>
  >
>

type LibraryTarget<E> = Readonly<{
  view: LibraryView<E>
  publish: ReadonlyArray<string>
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

const upsertTemplate = (library: Library, template: TemplateDefinition) =>
  applyTemplateUpsert(library, template)

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

export const createOrgTemplate = Atom.family(
  ({ req }: Readonly<{ req: OrgLibraryRequest }>) =>
    libraryMutation(
      "createOrgTemplate",
      orgTarget(req),
      (library, input: CreateTemplateInput) =>
        applyTemplateCreate(library, input, "org"),
      (input) =>
        Api.use((client) =>
          client.library.createOrgTemplate({
            params: req.params,
            payload: input
          })
        ),
      upsertTemplate
    )
)

export const updateOrgTemplate = Atom.family(
  ({ req, key }: OrgKeyed<TemplateKey>) =>
    libraryMutation(
      "updateOrgTemplate",
      orgTarget(req),
      (library, patch: UpdateTemplateInput) =>
        applyTemplateUpdate(library, key, patch),
      (patch) =>
        Api.use((client) =>
          client.library.updateOrgTemplate({
            params: { ...req.params, key },
            payload: patch
          })
        ),
      upsertTemplate
    )
)

export const removeOrgTemplate = Atom.family(
  ({ req, key }: OrgKeyed<TemplateKey>) =>
    libraryMutation(
      "removeOrgTemplate",
      orgTarget(req),
      (library, _input: void) => applyTemplateRemove(library, key, "org"),
      () =>
        Api.use((client) =>
          client.library.removeOrgTemplate({ params: { ...req.params, key } })
        ),
      (library) => applyTemplateRemove(library, key, "org")
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

export const createProjectTemplate = Atom.family(
  ({ req }: Readonly<{ req: ProjectLibraryRequest }>) =>
    libraryMutation(
      "createProjectTemplate",
      projectTarget(req),
      (library, input: CreateTemplateInput) =>
        applyTemplateCreate(library, input, "project"),
      (input) =>
        Api.use((client) =>
          client.library.createProjectTemplate({
            params: req.params,
            payload: input
          })
        ),
      upsertTemplate
    )
)

export const updateProjectTemplate = Atom.family(
  ({ req, key }: ProjectKeyed<TemplateKey>) =>
    libraryMutation(
      "updateProjectTemplate",
      projectTarget(req),
      (library, patch: UpdateTemplateInput) =>
        applyTemplateUpdate(library, key, patch),
      (patch) =>
        Api.use((client) =>
          client.library.updateProjectTemplate({
            params: { ...req.params, key },
            payload: patch
          })
        ),
      upsertTemplate
    )
)

export const removeProjectTemplate = Atom.family(
  ({ req, key }: ProjectKeyed<TemplateKey>) =>
    libraryMutation(
      "removeProjectTemplate",
      projectTarget(req),
      (library, _input: void) => applyTemplateRemove(library, key, "project"),
      () =>
        Api.use((client) =>
          client.library.removeProjectTemplate({
            params: { ...req.params, key }
          })
        ),
      (library) => applyTemplateRemove(library, key, "project")
    )
)

export const hideProjectTemplate = Atom.family(
  ({ req, key }: ProjectKeyed<TemplateKey>) =>
    libraryMutation(
      "hideProjectTemplate",
      projectTarget(req),
      (library, _input: void) => applyTemplateHide(library, key),
      () =>
        Api.use((client) =>
          client.library.hideProjectTemplate({ params: { ...req.params, key } })
        ),
      (library) => applyTemplateHide(library, key)
    )
)

export const setOrgTemplateDefaults = Atom.family(
  ({ req }: Readonly<{ req: OrgLibraryRequest; type?: TicketType }>) =>
    libraryMutation(
      "setOrgTemplateDefaults",
      orgTarget(req),
      (library, input: UpdateTemplateDefaultsInput) =>
        applyTemplateDefaults(library, input),
      (input) =>
        Api.use((client) =>
          client.library.setOrgTemplateDefaults({
            params: req.params,
            payload: input
          })
        ),
      (library, defaults: LibraryDefaults) => ({ ...library, ...defaults })
    )
)

export const setTemplateDefaults = Atom.family(
  ({ req }: Readonly<{ req: ProjectLibraryRequest; type?: TicketType }>) =>
    libraryMutation(
      "setTemplateDefaults",
      projectTarget(req),
      (library, input: UpdateTemplateDefaultsInput) =>
        applyTemplateDefaults(library, input),
      (input) =>
        Api.use((client) =>
          client.library.setTemplateDefaults({
            params: req.params,
            payload: input
          })
        ),
      (library, defaults: LibraryDefaults) => ({ ...library, ...defaults })
    )
)
