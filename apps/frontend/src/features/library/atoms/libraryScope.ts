import type { BlockKey, TypeKey } from "@pp/shared"

import {
  createOrgBlock,
  createOrgType,
  createProjectBlock,
  createProjectType,
  orgLibraryFor,
  orgLibraryRequest,
  projectLibraryFor,
  projectLibraryRequest,
  removeOrgBlock,
  removeOrgType,
  removeProjectBlock,
  removeProjectType,
  updateOrgBlock,
  updateOrgType,
  updateProjectBlock,
  updateProjectType,
  type OrgLibraryRequest,
  type ProjectLibraryRequest
} from "@/features/library/atoms/library"

export type LibraryLayer = "org" | "project"

export type LibraryScope =
  | Readonly<{ layer: "org"; req: OrgLibraryRequest }>
  | Readonly<{ layer: "project"; req: ProjectLibraryRequest }>

export const orgScope = (orgSlug: string): LibraryScope => ({
  layer: "org",
  req: orgLibraryRequest(orgSlug)
})

export const projectScope = (orgSlug: string, slug: string): LibraryScope => ({
  layer: "project",
  req: projectLibraryRequest(orgSlug, slug)
})

export const libraryView = (scope: LibraryScope) =>
  scope.layer === "org"
    ? orgLibraryFor(scope.req)
    : projectLibraryFor(scope.req)

export const createTypeAtom = (scope: LibraryScope) =>
  scope.layer === "org"
    ? createOrgType({ req: scope.req })
    : createProjectType({ req: scope.req })

export const createBlockAtom = (scope: LibraryScope) =>
  scope.layer === "org"
    ? createOrgBlock({ req: scope.req })
    : createProjectBlock({ req: scope.req })

export const removeTypeAtom = (scope: LibraryScope, key: TypeKey) =>
  scope.layer === "org"
    ? removeOrgType({ req: scope.req, key })
    : removeProjectType({ req: scope.req, key })

export const removeBlockAtom = (scope: LibraryScope, key: BlockKey) =>
  scope.layer === "org"
    ? removeOrgBlock({ req: scope.req, key })
    : removeProjectBlock({ req: scope.req, key })

export const updateTypeAtom = (scope: LibraryScope, key: TypeKey) =>
  scope.layer === "org"
    ? updateOrgType({ req: scope.req, key })
    : updateProjectType({ req: scope.req, key })

export const updateBlockAtom = (scope: LibraryScope, key: BlockKey) =>
  scope.layer === "org"
    ? updateOrgBlock({ req: scope.req, key })
    : updateProjectBlock({ req: scope.req, key })
