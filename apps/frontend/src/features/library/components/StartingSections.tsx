import {
  blockLookupFor,
  type BlockDefinition,
  type BlockLookup,
  type Library
} from "@pp/shared"
import { GripVertical, Plus, Text, X } from "lucide-react"
import { Reorder, useDragControls } from "motion/react"
import { useMemo, useRef, useState, type ReactNode } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import { blockChrome } from "@/features/editor/lib/blockChrome"
import { SURFACE_BG } from "@/lib/surfaceClasses"
import { useSurface } from "@/lib/surfaceContext"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

import type { LibraryScope } from "../atoms/libraryScope"
import {
  bodyOfRows,
  contentSummary,
  moveRow,
  sectionsToAdd,
  startingRows,
  withoutRow,
  withSection,
  type StartingRow
} from "../lib/startingSections"
import { BlockIconGlyph } from "./BlockIconGlyph"
import { SameOnEveryTicketBadge } from "./EntryBadges"
import { LibraryEntryLink } from "./LibraryEntryLink"

type StartingSectionsProps = Readonly<{
  scope: LibraryScope
  library: Library
  body: string
  editable: boolean
  onChange: (body: string) => void
}>

type RowView = Readonly<{
  name: string
  icon: ReactNode
  badges: ReactNode
  summary: string
  sectionKey: string | null
}>

const rowView = (row: StartingRow, lookup: BlockLookup): RowView => {
  if (row.kind === "text")
    return {
      name: m.templates_types_custom_text(),
      icon: (
        <Text
          aria-hidden
          className="size-4 shrink-0 text-muted-foreground"
          strokeWidth={1.75}
        />
      ),
      badges: null,
      summary: contentSummary(row.text),
      sectionKey: null
    }
  const definition: BlockDefinition | undefined = lookup(row.key)
  const chrome = blockChrome(row.key, lookup)
  const same = row.kind === "custom" ? row.sync : (definition?.sync ?? false)
  return {
    name: chrome.name,
    icon: <BlockIconGlyph icon={chrome.icon} color={chrome.color} />,
    badges: (
      <>
        {same ? <SameOnEveryTicketBadge /> : null}
        {row.kind === "custom" ? (
          <Badge size="xs">{m.templates_types_custom_badge()}</Badge>
        ) : null}
      </>
    ),
    summary:
      row.kind === "custom"
        ? contentSummary(row.content)
        : definition === undefined
          ? m.templates_types_section_missing()
          : contentSummary(definition.content),
    sectionKey:
      row.kind === "section" && definition !== undefined ? row.key : null
  }
}

export function StartingSections({
  scope,
  library,
  body,
  editable,
  onChange
}: StartingSectionsProps) {
  const lookup = useMemo(() => blockLookupFor(library), [library])
  const rows = useMemo(() => startingRows(body), [body])
  const [dragOrder, setDragOrder] = useState<ReadonlyArray<StartingRow> | null>(
    null
  )
  const order = dragOrder ?? rows
  const dragged = useRef<ReadonlyArray<StartingRow> | null>(null)
  const commit = (next: ReadonlyArray<StartingRow>) => {
    const nextBody = bodyOfRows(next)
    if (nextBody !== bodyOfRows(rows)) onChange(nextBody)
  }
  const available = sectionsToAdd(library, rows)

  if (!editable)
    return rows.length === 0 ? (
      <EmptyStart />
    ) : (
      <ul className="flex flex-col gap-1.5">
        {rows.map((row) => (
          <li key={row.id} className="list-none">
            <RowCard
              scope={scope}
              view={rowView(row, lookup)}
              editable={false}
            />
          </li>
        ))}
      </ul>
    )

  return (
    <div className="flex flex-col gap-2">
      {order.length === 0 ? (
        <EmptyStart />
      ) : (
        <Reorder.Group
          as="ul"
          axis="y"
          values={[...order]}
          onReorder={(next) => {
            dragged.current = next
            setDragOrder(next)
          }}
          className="flex flex-col gap-1.5"
        >
          {order.map((row) => (
            <SortableRow
              key={row.id}
              scope={scope}
              row={row}
              view={rowView(row, lookup)}
              onDrop={() => {
                const next = dragged.current
                dragged.current = null
                setDragOrder(null)
                if (next !== null) commit(next)
              }}
              onMove={(offset) => commit(moveRow(rows, row.id, offset))}
              onRemove={() => commit(withoutRow(rows, row.id))}
            />
          ))}
        </Reorder.Group>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger
          disabled={available.length === 0}
          render={
            <Button
              type="button"
              variant="tertiary"
              size="sm"
              leadingIcon={Plus}
              className="self-start"
            >
              {m.templates_types_add_section()}
            </Button>
          }
        />
        <DropdownMenuContent align="start" sideOffset={6} className="w-64">
          {available.map((section) => (
            <DropdownMenuItem
              key={section.key}
              onClick={() => commit(withSection(rows, section.key))}
            >
              <BlockIconGlyph icon={section.icon} color={section.color} />
              <span className="min-w-0 flex-1 truncate">{section.name}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

function EmptyStart() {
  return (
    <p className="rounded-lg border border-dashed border-border px-3 py-4 text-body text-muted-foreground">
      {m.templates_types_starts_empty()}
    </p>
  )
}

function SortableRow({
  scope,
  row,
  view,
  onDrop,
  onMove,
  onRemove
}: Readonly<{
  scope: LibraryScope
  row: StartingRow
  view: RowView
  onDrop: () => void
  onMove: (offset: number) => void
  onRemove: () => void
}>) {
  const controls = useDragControls()
  const [dragging, setDragging] = useState(false)
  return (
    <Reorder.Item
      value={row}
      dragListener={false}
      dragControls={controls}
      onDragStart={() => setDragging(true)}
      onDragEnd={() => {
        setDragging(false)
        onDrop()
      }}
      className={cn("relative list-none", dragging && "z-10")}
    >
      <RowCard
        scope={scope}
        view={view}
        editable
        dragging={dragging}
        handle={
          <button
            type="button"
            aria-label={m.templates_types_reorder_aria({ name: view.name })}
            onPointerDown={(event) => controls.start(event)}
            onKeyDown={(event) => {
              if (event.key === "ArrowUp") {
                event.preventDefault()
                onMove(-1)
              }
              if (event.key === "ArrowDown") {
                event.preventDefault()
                onMove(1)
              }
            }}
            className="flex h-8 w-5 shrink-0 cursor-grab touch-none items-center justify-center rounded-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none active:cursor-grabbing"
          >
            <GripVertical className="size-4" />
          </button>
        }
        onRemove={onRemove}
      />
    </Reorder.Item>
  )
}

function RowCard({
  scope,
  view,
  editable,
  dragging = false,
  handle,
  onRemove
}: Readonly<{
  scope: LibraryScope
  view: RowView
  editable: boolean
  dragging?: boolean
  handle?: ReactNode
  onRemove?: () => void
}>) {
  const substrate = useSurface()
  return (
    <div
      data-starting-row={view.sectionKey ?? "text"}
      className={cn(
        "flex min-h-14 items-center gap-2 rounded-lg border border-border bg-card py-2 pr-2",
        handle === undefined ? "pl-3" : "pl-1",
        dragging && cn(SURFACE_BG[Math.min(substrate + 1, 8)], "shadow-md")
      )}
    >
      {handle}
      {view.icon}
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="min-w-0 truncate text-body font-semibold">
            {view.name}
          </span>
          {view.badges}
        </span>
        {view.summary === "" ? null : (
          <span className="truncate text-caption text-muted-foreground">
            {view.summary}
          </span>
        )}
      </div>
      {view.sectionKey === null ? null : (
        <Button
          variant="raised"
          size="xs"
          render={
            <LibraryEntryLink
              scope={scope}
              kind="section"
              entryKey={view.sectionKey}
            />
          }
        >
          {editable
            ? m.templates_types_section_edit()
            : m.templates_types_section_view()}
        </Button>
      )}
      {onRemove === undefined ? null : (
        <Button
          type="button"
          variant="quiet"
          size="square-7"
          aria-label={m.templates_types_remove_aria({ name: view.name })}
          onClick={onRemove}
        >
          <X className="size-3.5" strokeWidth={1.75} />
        </Button>
      )}
    </div>
  )
}
