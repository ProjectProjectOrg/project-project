import { useAtomSet, useAtomValue } from "@effect/atom-react"
import {
  isReservedStatusSlug,
  type OrderKey,
  type ProjectStatus,
  type UpdateStatusInput,
  StatusLabel,
  StatusColor
} from "@pp/shared"
import * as Cause from "effect/Cause"
import * as Exit from "effect/Exit"
import * as Option from "effect/Option"
import { GripVertical } from "lucide-react"
import { Reorder, useDragControls, type DragControls } from "motion/react"
import { useState } from "react"

import {
  reorderStatus,
  statusesRequest,
  updateStatus
} from "@/features/projects/atoms/projectStatuses"
import { useProjectRoute } from "@/features/projects/hooks/useProject"
import { StatusActionsMenu } from "@/features/statuses/components/StatusActionsMenu"
import {
  StatusEditorForm,
  type StatusEditorValues
} from "@/features/statuses/forms/status-editor"
import { STATUS_ICON_NAMES } from "@/features/statuses/lib/statusIcons"
import {
  isPinnedStatus,
  type PhaseEntry
} from "@/features/statuses/lib/statusPhases"
import {
  statusLabelFor,
  statusMetaFor
} from "@/features/tickets/lib/ticketMeta"
import { useProjectActor } from "@/lib/access"
import { statusSaveErrorMessage } from "@/lib/errorMessage"
import { SURFACE_BG } from "@/lib/surfaceClasses"
import { useSurface } from "@/lib/surfaceContext"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

type Props = Readonly<{
  entry: Extract<PhaseEntry, { kind: "status" }>
  statuses: ReadonlyArray<ProjectStatus>
  count: number
  dragging: boolean
  onDragStart: () => void
  onDragEnd: () => OrderKey | null
  onMove: (delta: -1 | 1) => OrderKey | null
}>

const REVEAL =
  "opacity-0 transition-all group-hover/reveal:opacity-100 focus-visible:opacity-100 data-[popup-open]:opacity-100"

const isUnchanged = (status: ProjectStatus, draft: StatusEditorValues) =>
  draft.label.trim() === status.label &&
  draft.icon === status.icon &&
  draft.color === status.color &&
  draft.description.trim() === (status.description ?? "")

const updatePatch = (
  draft: StatusEditorValues,
  baseline: boolean
): UpdateStatusInput => {
  const trimmed = draft.description.trim()
  const description = trimmed.length > 0 ? trimmed : null
  if (baseline) return { color: StatusColor.make(draft.color), description }
  return {
    label: StatusLabel.make(draft.label.trim()),
    icon: draft.icon,
    color: StatusColor.make(draft.color),
    description
  }
}

export function StatusRow({
  entry,
  statuses,
  count,
  dragging,
  onDragStart,
  onDragEnd,
  onMove
}: Props) {
  const { status } = entry
  const { orgSlug, slug } = useProjectRoute()
  const canManage = useProjectActor().call("statuses", "update")
  const baseline = isReservedStatusSlug(status.slug)
  const req = statusesRequest(orgSlug, slug)
  const updateMutation = updateStatus({ req, statusSlug: status.slug })
  const reorderMutation = reorderStatus({ req, statusSlug: status.slug })
  const update = useAtomSet(updateMutation, { mode: "promiseExit" })
  const updateState = useAtomValue(updateMutation)
  const reorder = useAtomSet(reorderMutation)
  const reorderState = useAtomValue(reorderMutation)
  const dataWaiting = updateState.waiting || reorderState.waiting
  const controls = useDragControls()
  const substrate = useSurface()
  const [isDragging, setIsDragging] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)

  const meta = statusMetaFor(status.slug, statuses)
  const Icon = meta.icon
  const icon = (
    <Icon
      className={cn("size-4", meta.className)}
      style={meta.color ? { color: meta.color } : undefined}
      strokeWidth={1.75}
    />
  )
  const displayLabel = baseline
    ? statusLabelFor(status.slug, statuses)
    : status.label
  const commitOrder = (orderKey: OrderKey | null) => {
    if (orderKey !== null) reorder({ orderKey })
  }
  const closeEditor = () => {
    setEditing(false)
    setEditError(null)
  }

  return (
    <Reorder.Item
      value={entry}
      dragListener={false}
      dragControls={controls}
      onDragStart={() => {
        setIsDragging(true)
        onDragStart()
      }}
      onDragEnd={() => {
        setIsDragging(false)
        commitOrder(onDragEnd())
      }}
      className={cn("list-none", isDragging && "z-10 shadow-md")}
      animate={{ scale: isDragging ? 1.01 : 1 }}
      transition={{
        duration: 0.12,
        ease: [0.22, 1, 0.36, 1],
        layout: dragging ? undefined : { duration: 0 }
      }}
    >
      {editing ? (
        <StatusEditorForm
          initial={{
            label: displayLabel,
            icon:
              STATUS_ICON_NAMES.find((name) => name === status.icon) ??
              "Circle",
            color: status.color,
            description: status.description ?? ""
          }}
          identityLocked={baseline}
          submitLabel={m.tickets_status_save()}
          error={editError}
          onCancel={closeEditor}
          onSubmit={async (draft) => {
            if (!isUnchanged(status, draft)) {
              const exit = await update(updatePatch(draft, baseline))
              if (Exit.isFailure(exit)) {
                setEditError(
                  Option.match(Cause.findErrorOption(exit.cause), {
                    onNone: m.tickets_status_update_error_fallback,
                    onSome: (error) =>
                      statusSaveErrorMessage(
                        error,
                        m.tickets_status_update_error_fallback
                      )
                  })
                )
                return false
              }
            }
            closeEditor()
            return true
          }}
        />
      ) : (
        <div
          className={cn(
            "group/reveal flex min-h-14 items-center gap-1 py-2 pr-2 pl-1 transition-colors duration-150",
            isDragging && SURFACE_BG[Math.min(substrate + 1, 8)]
          )}
        >
          {isPinnedStatus(status.slug) ? (
            <span className="w-5 shrink-0" />
          ) : (
            <DragHandle
              controls={controls}
              onMoveUp={() => commitOrder(onMove(-1))}
              onMoveDown={() => commitOrder(onMove(1))}
              ariaLabel={m.tickets_status_drag_handle_aria({
                label: displayLabel
              })}
            />
          )}
          <span
            className="flex size-8 shrink-0 items-center justify-center"
            aria-hidden
          >
            {icon}
          </span>
          <div
            className={cn(
              "flex min-w-0 flex-1 flex-col px-2",
              dataWaiting && "animate-pulse"
            )}
          >
            <span className="truncate text-sm">{displayLabel}</span>
            <span
              title={status.description ?? undefined}
              className="truncate text-xs text-muted-foreground"
            >
              <span className="tabular-nums">
                {m.tickets_status_phase_ticket_count({ count })}
              </span>
              {status.description ? ` · ${status.description}` : null}
            </span>
          </div>
          {canManage ? (
            <StatusActionsMenu
              status={status}
              statuses={statuses}
              label={displayLabel}
              canDelete={!baseline}
              onEdit={() => setEditing(true)}
              triggerClassName={REVEAL}
            />
          ) : (
            <span className="size-8 shrink-0" />
          )}
        </div>
      )}
    </Reorder.Item>
  )
}

function DragHandle({
  controls,
  onMoveUp,
  onMoveDown,
  ariaLabel
}: Readonly<{
  controls: DragControls
  onMoveUp: () => void
  onMoveDown: () => void
  ariaLabel: string
}>) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onPointerDown={(e) => {
        if (!e.currentTarget.matches(":disabled")) controls.start(e)
      }}
      onKeyDown={(e) => {
        if (e.key === "ArrowUp") {
          e.preventDefault()
          onMoveUp()
        }
        if (e.key === "ArrowDown") {
          e.preventDefault()
          onMoveDown()
        }
      }}
      className={cn(
        "flex h-8 w-5 shrink-0 cursor-grab touch-none items-center justify-center rounded text-muted-foreground/60 hover:text-foreground focus-visible:text-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none active:cursor-grabbing",
        REVEAL
      )}
    >
      <GripVertical className="h-4 w-4" />
    </button>
  )
}
