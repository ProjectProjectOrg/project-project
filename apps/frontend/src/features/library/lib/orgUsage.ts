import type { Library } from "@pp/shared"

import { m } from "@/paraglide/messages"

import type { LibraryKind } from "./libraryModel"

export type UsageProject = Readonly<{ slug: string; name: string }>

export type ProjectLibrary = Readonly<{
  project: UsageProject
  library: Library
}>

export type EntryUsage = Readonly<{
  projects: number
  asIs: number
  changedIn: ReadonlyArray<UsageProject>
  hiddenIn: ReadonlyArray<UsageProject>
}>

type ProjectUse = "as-is" | "changed" | "hidden"

const entriesOf = (library: Library, kind: LibraryKind) =>
  kind === "type" ? library.types : library.blocks

const useIn = (library: Library, kind: LibraryKind, key: string) => {
  const entry = entriesOf(library, kind).find((item) => item.key === key)
  if (entry === undefined || entry.origin !== "project") return "as-is"
  return entry.hidden ? "hidden" : "changed"
}

export const entryUsage = (
  libraries: ReadonlyArray<ProjectLibrary>,
  kind: LibraryKind,
  key: string
) => {
  const projectsWith = (use: ProjectUse) =>
    libraries.flatMap(({ library, project }) =>
      useIn(library, kind, key) === use ? [project] : []
    )
  return {
    projects: libraries.length,
    asIs: projectsWith("as-is").length,
    changedIn: projectsWith("changed"),
    hiddenIn: projectsWith("hidden")
  }
}

export const asIsText = (usage: EntryUsage) => {
  if (usage.projects === 0) return m.templates_types_usage_no_projects()
  if (usage.asIs === usage.projects)
    return usage.projects === 1
      ? m.templates_types_usage_all_one()
      : m.templates_types_usage_all({ count: usage.projects })
  if (usage.asIs === 0) return m.templates_types_usage_none()
  return usage.asIs === 1
    ? m.templates_types_usage_some_one()
    : m.templates_types_usage_some({ count: usage.asIs })
}
