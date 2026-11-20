import type { Library, LibraryOrigin } from "@pp/shared"
import type { ReactNode } from "react"

import { Button } from "../../components/button"
import { Link2 } from "../../components/icons"
import { cn } from "../../lib/utils"
import { m } from "../messages"
import { BUILTIN_LIBRARY } from "./block-chrome"
import type { SyncedBlockMode } from "./synced-content"

const ORIGIN_LABELS: Record<LibraryOrigin, () => string> = {
  builtin: m.editor_block_origin_builtin,
  org: m.editor_block_origin_org,
  project: m.editor_block_origin_project
}

export const syncedChipLabel = (
  mode: SyncedBlockMode,
  origin: LibraryOrigin
) =>
  mode === "reference"
    ? m.editor_synced_linked()
    : m.editor_synced_from({ origin: ORIGIN_LABELS[origin]() })

type LayerPermissions = Readonly<{ org: boolean; project: boolean }>

const EDITABLE_FROM: Record<
  LibraryOrigin,
  (canEdit: LayerPermissions) => boolean
> = {
  builtin: (canEdit) => canEdit.org,
  org: (canEdit) => canEdit.org,
  project: (canEdit) => canEdit.project
}

export const canEditDefinition = (
  origin: LibraryOrigin,
  canEdit: LayerPermissions
) => EDITABLE_FROM[origin](canEdit)

export type SyncedEditAction = "edit" | "managed" | "none"

export const syncedEditAction = (
  library: Library,
  origin: LibraryOrigin,
  canEdit: LayerPermissions
) => {
  if (library === BUILTIN_LIBRARY) return "none"
  return canEditDefinition(origin, canEdit) ? "edit" : "managed"
}

export const managedInLabel = (origin: LibraryOrigin) =>
  origin === "project"
    ? m.editor_synced_managed_project()
    : m.editor_synced_managed_org()

export function SyncedChip({
  label,
  visible = false,
  children
}: Readonly<{ label: string; visible?: boolean; children?: ReactNode }>) {
  return (
    <span
      data-synced-chip
      className={cn(
        "pointer-events-none absolute right-2 bottom-[calc(100%-0.5rem)] z-10 flex h-6 items-center gap-1 rounded-[12px] bg-(color:--tooltip) pl-1.5 text-caption whitespace-nowrap text-muted-foreground opacity-0 shadow-(--tooltip-edge) transition-opacity duration-150 select-none [corner-shape:var(--button-corner)] group-focus-within/reveal:pointer-events-auto group-focus-within/reveal:opacity-100 group-hover/reveal:pointer-events-auto group-hover/reveal:opacity-100",
        visible && "pointer-events-auto",
        visible && "opacity-100"
      )}
    >
      <Link2 aria-hidden strokeWidth={1.75} className="size-3.5 shrink-0" />
      <span className="pr-1.5">{label}</span>
      {children}
    </span>
  )
}

export function SyncedChipAction({
  label,
  onClick
}: Readonly<{ label: string; onClick: () => void }>) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="xs"
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      {label}
    </Button>
  )
}

export function SyncedChipNote({ label }: Readonly<{ label: string }>) {
  return <span className="px-1.5">{label}</span>
}

export function SourceRemovedNote() {
  return (
    <p className="text-caption text-muted-foreground">
      {m.editor_synced_source_removed()}
    </p>
  )
}
