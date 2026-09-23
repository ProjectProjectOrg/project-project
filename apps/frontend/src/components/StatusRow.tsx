import { useAtomSet, useAtomValue } from "@effect/atom-react"
import {
  isReservedStatusSlug,
  type OrderKey,
  type ProjectStatus,
  type StatusIconName
} from "@pp/shared"
import { GripVertical, Lock } from "lucide-react"
import { Reorder, useDragControls, type DragControls } from "motion/react"
import { useEffect, useMemo, useState } from "react"

import { ColorPicker } from "@/components/ColorPicker"
import { StatusDeleteConfirm } from "@/components/StatusDeleteConfirm"
import { StatusIconPicker } from "@/components/StatusIconPicker"
import { Input } from "@/components/ui/input"
import {
  reorderStatus,
  statusesRequest,
  updateStatus
} from "@/features/projects/atoms/projectStatuses"
import { statusLabelFor, statusMetaFor } from "@/lib/ticket-meta"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

type Props = {
  status: ProjectStatus
  statuses: ReadonlyArray<ProjectStatus>
  orgSlug: string
  slug: string
  onDragStart: () => void
  onDragEnd: () => OrderKey | null
  onMoveUp?: () => OrderKey | null
  onMoveDown?: () => OrderKey | null
}

export function StatusRow({
  status,
  statuses,
  orgSlug,
  slug,
  onDragStart,
  onDragEnd,
  onMoveUp,
  onMoveDown
}: Props) {
  const baseline = isReservedStatusSlug(status.slug)
  const req = useMemo(() => statusesRequest(orgSlug, slug), [orgSlug, slug])
  const updateMutation = updateStatus({ req, statusSlug: status.slug })
  const reorderMutation = reorderStatus({ req, statusSlug: status.slug })
  const update = useAtomSet(updateMutation)
  const updateState = useAtomValue(updateMutation)
  const reorder = useAtomSet(reorderMutation)
  const reorderState = useAtomValue(reorderMutation)
  const dataWaiting = updateState.waiting || reorderState.waiting
  const controls = useDragControls()
  const [draftLabel, setDraftLabel] = useState<string>(status.label)
  const [isDragging, setIsDragging] = useState(false)
  const [iconMenuOpen, setIconMenuOpen] = useState(false)
  const [colorMenuOpen, setColorMenuOpen] = useState(false)
  const menuOpen = iconMenuOpen || colorMenuOpen

  useEffect(() => {
    setDraftLabel(status.label)
  }, [status.label])

  const commitLabel = () => {
    if (baseline || draftLabel === status.label) return
    const trimmed = draftLabel.trim()
    if (trimmed.length === 0) {
      setDraftLabel(status.label)
      return
    }
    update({ label: trimmed as ProjectStatus["label"] })
  }

  const baselineMeta = baseline ? statusMetaFor(status.slug, statuses) : null
  const BaselineIcon = baselineMeta?.icon
  const displayLabel = baseline
    ? statusLabelFor(status.slug, statuses)
    : status.label

  return (
    <Reorder.Item
      value={status}
      dragListener={false}
      dragControls={controls}
      onDragStart={() => {
        setIsDragging(true)
        onDragStart()
      }}
      onDragEnd={() => {
        setIsDragging(false)
        const orderKey = onDragEnd()
        if (orderKey !== null) reorder({ orderKey })
      }}
      className={cn(
        "list-none rounded-md",
        isDragging && "z-10 shadow-md",
        menuOpen && "z-20"
      )}
      animate={{ scale: isDragging ? 1.01 : 1 }}
      transition={{ duration: 0.12, ease: [0.22, 1, 0.36, 1] }}
    >
      <div
        className={cn(
          "flex items-center gap-2 rounded-md px-1 py-1 transition-colors duration-150",
          isDragging ? "bg-card" : "hover:bg-accent/40"
        )}
      >
        <DragHandle
          controls={controls}
          onMoveUp={
            onMoveUp
              ? () => {
                  const orderKey = onMoveUp()
                  if (orderKey !== null) reorder({ orderKey })
                }
              : undefined
          }
          onMoveDown={
            onMoveDown
              ? () => {
                  const orderKey = onMoveDown()
                  if (orderKey !== null) reorder({ orderKey })
                }
              : undefined
          }
          ariaLabel={m.tickets_status_drag_handle_aria({ label: displayLabel })}
        />

        {baseline && baselineMeta && BaselineIcon ? (
          <>
            <div
              className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center",
                dataWaiting && "animate-pulse"
              )}
              aria-hidden
            >
              <BaselineIcon
                className={cn("h-4 w-4", baselineMeta.className)}
                style={
                  baselineMeta.color ? { color: baselineMeta.color } : undefined
                }
                strokeWidth={1.75}
              />
            </div>
            <span
              className={cn(
                "flex-1 truncate px-1 text-sm text-muted-foreground",
                dataWaiting && "animate-pulse"
              )}
            >
              {displayLabel}
            </span>
            <div
              role="img"
              aria-label={m.tickets_status_baseline_locked_aria()}
              className="flex h-8 w-8 shrink-0 items-center justify-center text-muted-foreground/40"
            >
              <Lock className="h-3.5 w-3.5" />
            </div>
          </>
        ) : (
          <>
            <StatusIconPicker
              className={cn(dataWaiting && "animate-pulse")}
              value={status.icon}
              color={status.color}
              onOpenChange={setIconMenuOpen}
              onChange={(icon) => update({ icon: icon as StatusIconName })}
            />
            <div
              className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center",
                dataWaiting && "animate-pulse"
              )}
            >
              <ColorPicker
                value={status.color}
                onOpenChange={setColorMenuOpen}
                onChange={(color) =>
                  update({ color: color as ProjectStatus["color"] })
                }
              />
            </div>
            <Input
              value={draftLabel}
              onChange={(e) => setDraftLabel(e.target.value)}
              onBlur={commitLabel}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur()
                if (e.key === "Escape") {
                  setDraftLabel(status.label)
                  ;(e.target as HTMLInputElement).blur()
                }
              }}
              className={cn(
                "h-8 flex-1 rounded-md",
                dataWaiting && "animate-pulse"
              )}
            />
            <StatusDeleteConfirm
              status={status}
              statuses={statuses}
              orgSlug={orgSlug}
              slug={slug}
            />
          </>
        )}
      </div>
    </Reorder.Item>
  )
}

function DragHandle({
  controls,
  onMoveUp,
  onMoveDown,
  ariaLabel
}: {
  controls: DragControls
  onMoveUp?: () => void
  onMoveDown?: () => void
  ariaLabel: string
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onPointerDown={(e) => controls.start(e)}
      onKeyDown={(e) => {
        if (e.key === "ArrowUp" && onMoveUp) {
          e.preventDefault()
          onMoveUp()
        }
        if (e.key === "ArrowDown" && onMoveDown) {
          e.preventDefault()
          onMoveDown()
        }
      }}
      className="flex h-8 w-5 shrink-0 cursor-grab touch-none items-center justify-center rounded text-muted-foreground/40 transition-colors duration-100 hover:text-foreground focus-visible:text-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none active:cursor-grabbing"
    >
      <GripVertical className="h-4 w-4" />
    </button>
  )
}
