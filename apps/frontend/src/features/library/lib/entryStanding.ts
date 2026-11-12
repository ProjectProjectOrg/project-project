import type { LibraryOrigin } from "@pp/shared"

import type { LibraryLayer } from "../atoms/libraryScope"

export type Placement = Readonly<{
  origin: LibraryOrigin
  shadows: LibraryOrigin | null
  hidden: boolean
}>

export type EntryStanding = "shared" | "changed" | "own" | "hidden"

export type LibraryPermissions = Readonly<{ org: boolean; project: boolean }>

export type EntryNotice = "org-admins" | "project-managers" | null

export type EntryView = Readonly<{
  standing: EntryStanding
  editable: boolean
  canFork: boolean
  canEditUpstream: boolean
  canRevert: boolean
  canHide: boolean
  canShow: boolean
  canDelete: boolean
  notice: EntryNotice
}>

export type EntryGroups<A> = Readonly<{
  shared: ReadonlyArray<A>
  own: ReadonlyArray<A>
  hidden: ReadonlyArray<A>
}>

export const standingOf = (
  entry: Placement,
  layer: LibraryLayer
): EntryStanding => {
  if (entry.hidden) return "hidden"
  if (entry.origin !== layer) return "shared"
  return entry.shadows === null ? "own" : "changed"
}

export const groupEntries = <A extends Placement>(
  entries: ReadonlyArray<A>,
  layer: LibraryLayer
): EntryGroups<A> => {
  const standing = (entry: A) => standingOf(entry, layer)
  return {
    shared: entries.filter((entry) => {
      const value = standing(entry)
      return value === "shared" || value === "changed"
    }),
    own: entries.filter((entry) => standing(entry) === "own"),
    hidden: entries.filter((entry) => standing(entry) === "hidden")
  }
}

const noticeFor = (
  standing: EntryStanding,
  layer: LibraryLayer,
  permissions: LibraryPermissions
): EntryNotice => {
  if (layer === "org") return permissions.org ? null : "org-admins"
  if (!permissions.project && !permissions.org) return "project-managers"
  return standing === "shared" && !permissions.org ? "org-admins" : null
}

export const entryView = (
  entry: Placement,
  layer: LibraryLayer,
  permissions: LibraryPermissions
): EntryView => {
  const standing = standingOf(entry, layer)
  const mayEdit = permissions[layer]
  const ownsCopy = standing === "own" || standing === "changed"
  return {
    standing,
    editable: mayEdit && ownsCopy,
    canFork: mayEdit && standing === "shared",
    canEditUpstream:
      layer === "project" && permissions.org && standing === "shared",
    canRevert: mayEdit && standing === "changed",
    canHide: mayEdit && layer === "project" && standing === "shared",
    canShow: mayEdit && standing === "hidden",
    canDelete: mayEdit && standing === "own",
    notice: noticeFor(standing, layer, permissions)
  }
}

export const creatableLayers = (
  layer: LibraryLayer,
  permissions: LibraryPermissions
): ReadonlyArray<LibraryLayer> =>
  layer === "org"
    ? permissions.org
      ? ["org"]
      : []
    : [
        ...(permissions.project ? (["project"] as const) : []),
        ...(permissions.org ? (["org"] as const) : [])
      ]
