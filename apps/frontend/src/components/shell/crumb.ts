import type { GroupId, TicketId } from "@pp/shared"
import * as Data from "effect/Data"

import type { LibraryKind } from "@/features/library/lib/libraryModel"

export type Crumb = Data.TaggedEnum<{
  static: Readonly<{
    label: string
    to?: string
    params?: Record<string, string>
    // A static crumb that names whose settings these are (Profile), in the
    // place an org crumb takes.
    role?: "scope"
  }>
  org: Readonly<{ orgSlug: string; to?: string }>
  project: Readonly<{ orgSlug: string; slug: string; to?: string }>
  ticket: Readonly<{
    orgSlug: string
    slug: string
    id: TicketId
  }>
  sprint: Readonly<{
    orgSlug: string
    slug: string
    groupId: GroupId
  }>
  library: Readonly<{
    kind: LibraryKind
    orgSlug: string
    slug: string | null
    entryKey: string
  }>
}>
export const Crumb = Data.taggedEnum<Crumb>()

export type CrumbData = Crumb | ReadonlyArray<Crumb>
