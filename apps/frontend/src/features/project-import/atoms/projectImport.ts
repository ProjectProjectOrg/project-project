import type { RunProjectImportInput } from "@pp/shared"
import * as Atom from "effect/reactivity/Atom"

import { Api, uploadProjectArchive } from "@/api/Api"
import { Keys } from "@/api/keys"
import { query } from "@/api/query"
import { replaceWith, viewMutation } from "@/api/viewMutation"

export type ProjectImportOrgRequest = Readonly<{
  params: Readonly<{ orgSlug: string }>
}>

export type ProjectImportRequest = Readonly<{
  _view: "projectImport"
  params: Readonly<{ orgSlug: string; importId: string }>
}>

export const projectImportOrgRequest = (orgSlug: string) => ({
  params: { orgSlug }
})

export const projectImportRequest = (orgSlug: string, importId: string) =>
  ({
    _view: "projectImport",
    params: { orgSlug, importId }
  }) satisfies ProjectImportRequest

const projectImportQuery = (req: ProjectImportRequest) =>
  query("projectImports", "get", {
    params: req.params,
    timeToLive: "30 seconds",
    reactivityKeys: [Keys.projects(req.params.orgSlug)]
  })

export const projectImport = Atom.family((req: ProjectImportRequest) =>
  Atom.optimistic(projectImportQuery(req))
)

export const uploadProjectImport = Atom.family((req: ProjectImportOrgRequest) =>
  Api.runtime.fn((file: File) =>
    uploadProjectArchive({ orgSlug: req.params.orgSlug, file })
  )
)

export const runProjectImport = Atom.family((req: ProjectImportRequest) =>
  viewMutation(projectImport(req), {
    name: "runProjectImport",
    predict: (current, _input: RunProjectImportInput) => current,
    call: (client, input) =>
      client.projectImports.run({ params: req.params, payload: input }),
    confirm: replaceWith,
    publish: (imported) =>
      imported.status === "succeeded" ? [Keys.projects(req.params.orgSlug)] : []
  })
)

export const cancelProjectImport = Atom.family((req: ProjectImportRequest) =>
  viewMutation(projectImport(req), {
    name: "cancelProjectImport",
    predict: (current, _input: void) => current,
    call: (client) => client.projectImports.cancel({ params: req.params }),
    confirm: replaceWith
  })
)
