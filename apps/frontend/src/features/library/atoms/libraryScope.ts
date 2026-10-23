import type { BlockKey, TemplateKey, TicketType } from "@pp/shared"

import {
  createOrgBlock,
  createOrgTemplate,
  createProjectBlock,
  createProjectTemplate,
  hideProjectBlock,
  hideProjectTemplate,
  orgLibraryFor,
  projectLibraryFor,
  removeOrgBlock,
  removeOrgTemplate,
  removeProjectBlock,
  removeProjectTemplate,
  setOrgTemplateDefaults,
  setTemplateDefaults,
  updateOrgBlock,
  updateOrgTemplate,
  updateProjectBlock,
  updateProjectTemplate,
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

export const createTemplateAtom = (scope: LibraryScope) =>
  scope.layer === "org"
    ? createOrgTemplate({ req: scope.req })
    : createProjectTemplate({ req: scope.req })

export const createBlockAtom = (scope: LibraryScope) =>
  scope.layer === "org"
    ? createOrgBlock({ req: scope.req })
    : createProjectBlock({ req: scope.req })

export const removeTemplateAtom = (scope: LibraryScope, key: TemplateKey) =>
  scope.layer === "org"
    ? removeOrgTemplate({ req: scope.req, key })
    : removeProjectTemplate({ req: scope.req, key })

export const dropTemplateAtom = (
  scope: LibraryScope,
  entry: Readonly<{ key: TemplateKey; origin: LibraryLayer }>
) =>
  scope.layer === "org"
    ? removeOrgTemplate({ req: scope.req, key: entry.key })
    : entry.origin === "project"
      ? removeProjectTemplate({ req: scope.req, key: entry.key })
      : hideProjectTemplate({ req: scope.req, key: entry.key })

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

export const setDefaultsAtom = (scope: LibraryScope, type?: TicketType) => {
  const key = type === undefined ? {} : { type }
  return scope.layer === "org"
    ? setOrgTemplateDefaults({ req: scope.req, ...key })
    : setTemplateDefaults({ req: scope.req, ...key })
}

export const updateTemplateAtom = (scope: LibraryScope, key: TemplateKey) =>
  scope.layer === "org"
    ? updateOrgTemplate({ req: scope.req, key })
    : updateProjectTemplate({ req: scope.req, key })

export const updateBlockAtom = (scope: LibraryScope, key: BlockKey) =>
  scope.layer === "org"
    ? updateOrgBlock({ req: scope.req, key })
    : updateProjectBlock({ req: scope.req, key })
