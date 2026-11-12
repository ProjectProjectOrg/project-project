import type { BlockIconName } from "@pp/shared"
import { Plus } from "lucide-react"
import type { ReactNode } from "react"

import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

import type { LibraryScope } from "../atoms/libraryScope"
import type { LibraryKind } from "../lib/libraryModel"
import { BlockIconGlyph } from "./BlockIconGlyph"
import { LibraryEntryLink, LibraryNewLink } from "./LibraryEntryLink"

export const ENTRY_GRID_CLASS =
  "grid grid-cols-[repeat(auto-fill,minmax(min(15rem,100%),1fr))] gap-2"

type EntryCardProps = Readonly<{
  scope: LibraryScope
  kind: LibraryKind
  entry: Readonly<{
    key: string
    name: string
    icon: BlockIconName
    color: string | null
  }>
  badges?: ReactNode
  detail: string
  strip?: ReactNode
  control?: ReactNode
  off?: boolean
}>

export function EntryCard({
  scope,
  kind,
  entry,
  badges,
  detail,
  strip,
  control,
  off = false
}: EntryCardProps) {
  return (
    <li
      data-entry-card={entry.key}
      data-off={off ? "" : undefined}
      className="group/reveal relative flex min-w-0 list-none flex-col gap-1.5 rounded-lg border border-border bg-card p-3 transition-colors hover:bg-hover"
    >
      <LibraryEntryLink
        scope={scope}
        kind={kind}
        entryKey={entry.key}
        aria-label={entry.name}
        className="absolute inset-0 rounded-lg focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
      />
      <div className="pointer-events-none flex min-w-0 items-center gap-2">
        <span
          className={cn(
            "flex min-w-0 flex-1 items-center gap-2",
            off && "opacity-50"
          )}
        >
          <BlockIconGlyph icon={entry.icon} color={entry.color} />
          <span className="min-w-0 truncate text-body font-semibold">
            {entry.name}
          </span>
          {badges}
        </span>
        {control === undefined || control === null ? null : (
          <span className="pointer-events-auto relative flex">{control}</span>
        )}
      </div>
      <p
        className={cn(
          "pointer-events-none truncate text-caption text-muted-foreground",
          off && "opacity-50"
        )}
      >
        {detail === "" ? " " : detail}
      </p>
      {strip === undefined ? null : (
        <div className={cn("pointer-events-none min-w-0", off && "opacity-50")}>
          {strip}
        </div>
      )}
    </li>
  )
}

export function NewEntryCard({
  scope,
  kind
}: Readonly<{ scope: LibraryScope; kind: LibraryKind }>) {
  return (
    <li className="flex list-none">
      <LibraryNewLink
        scope={scope}
        kind={kind}
        className="flex min-h-14 flex-1 items-center justify-center gap-1.5 rounded-lg border border-dashed border-border text-body text-muted-foreground transition-all duration-100 hover:bg-hover hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none active:scale-[0.97]"
      >
        <Plus className="size-3.5" strokeWidth={1.75} />
        {kind === "type"
          ? m.templates_types_new_type()
          : m.templates_types_new_section()}
      </LibraryNewLink>
    </li>
  )
}
