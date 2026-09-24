import type { BlockKey } from "@pp/shared"

import {
  createOrgBlock,
  createProjectBlock,
  hideProjectBlock,
  orgLibraryFor,
  projectLibraryFor,
  removeOrgBlock,
  removeProjectBlock,
  updateOrgBlock,
  updateProjectBlock,
  type OrgLibraryRequest,
  type ProjectLibraryRequest
} from "@/features/library/atoms/library"

export type LibraryLayer = "org" | "project"

export type LibraryScope =
  | Readonly<{ layer: "org"; req: OrgLibraryRequest }>
  | Readonly<{ layer: "project"; req: ProjectLibraryRequest }>

export const orgScope = (orgSlug: string): LibraryScope => ({
  layer: "org",
  req: { params: { orgSlug } }
})

export const projectScope = (orgSlug: string, slug: string): LibraryScope => ({
  layer: "project",
  req: { params: { orgSlug, slug } }
})

export const libraryView = (scope: LibraryScope) =>
  scope.layer === "org"
    ? orgLibraryFor(scope.req)
    : projectLibraryFor(scope.req)

export const createBlockAtom = (scope: LibraryScope) =>
  scope.layer === "org"
    ? createOrgBlock({ req: scope.req })
    : createProjectBlock({ req: scope.req })

export const removeBlockAtom = (scope: LibraryScope, key: BlockKey) =>
  scope.layer === "org"
    ? removeOrgBlock({ req: scope.req, key })
    : removeProjectBlock({ req: scope.req, key })

export const dropBlockAtom = (
  scope: LibraryScope,
  entry: Readonly<{ key: BlockKey; origin: LibraryLayer }>
) =>
  scope.layer === "org"
    ? removeOrgBlock({ req: scope.req, key: entry.key })
    : entry.origin === "project"
      ? removeProjectBlock({ req: scope.req, key: entry.key })
      : hideProjectBlock({ req: scope.req, key: entry.key })

export const updateBlockAtom = (scope: LibraryScope, key: BlockKey) =>
  scope.layer === "org"
    ? updateOrgBlock({ req: scope.req, key })
    : updateProjectBlock({ req: scope.req, key })
