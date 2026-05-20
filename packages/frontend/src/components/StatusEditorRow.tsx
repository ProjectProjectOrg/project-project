import { useAtomSet } from "@effect-atom/atom-react"
import { GripVertical, Trash } from "lucide-react"
import { useEffect, useState } from "react"
import type { ProjectStatus } from "@projectproject/shared"
import { projectKey, updateStatusAtom } from "@/atoms/projectStatuses"
import { ColorPicker } from "@/components/ColorPicker"
import { StatusIconPicker } from "@/components/StatusIconPicker"
import { getStatusIcon } from "@/lib/status-icons"
import { isBaselineStatus } from "@/lib/status-baseline"
import { statusLabelFor } from "@/lib/ticket-meta"
import { cn } from "@/lib/utils"

type Props = {
  status: ProjectStatus
  statuses: ReadonlyArray<ProjectStatus>
  orgSlug: string
  slug: string
  onRequestDelete: (status: ProjectStatus) => void
}

export function StatusEditorRow({
  status,
  statuses,
  orgSlug,
  slug,
  onRequestDelete
}: Props) {
  const key = projectKey(orgSlug, slug)
  const update = useAtomSet(updateStatusAtom(key))
  const baseline = isBaselineStatus(status.slug)
  const [draftLabel, setDraftLabel] = useState<string>(status.label)

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
    update({
      statusSlug: status.slug,
      patch: { label: trimmed as ProjectStatus["label"] }
    })
  }

  const BaselineIcon = getStatusIcon(status.icon)
  const displayLabel = baseline ? statusLabelFor(status.slug, statuses) : status.label

  return (
    <div className="flex items-center gap-3 rounded-md border border-border bg-card p-2 transition-colors duration-100 hover:bg-accent/40">
      <GripVertical className="h-4 w-4 cursor-grab text-muted-foreground" />

      {baseline ? (
        <div className="flex h-8 w-8 items-center justify-center rounded-md border border-dashed border-border">
          <BaselineIcon
            className="h-4 w-4"
            style={status.color ? { color: status.color } : undefined}
          />
        </div>
      ) : (
        <StatusIconPicker
          value={status.icon}
          onChange={(icon) =>
            update({
              statusSlug: status.slug,
              patch: { icon: icon as ProjectStatus["icon"] }
            })
          }
        />
      )}

      <input
        value={baseline ? displayLabel : draftLabel}
        disabled={baseline}
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
          "flex-1 rounded-md border border-input bg-background px-2 py-1 text-sm transition-colors duration-100 disabled:cursor-not-allowed disabled:opacity-70"
        )}
      />

      {!baseline ? (
        <ColorPicker
          value={status.color}
          onChange={(color) =>
            update({
              statusSlug: status.slug,
              patch: { color: color as ProjectStatus["color"] }
            })
          }
        />
      ) : (
        <div
          className="h-6 w-6 rounded-full border border-border"
          style={{ backgroundColor: status.color }}
        />
      )}

      {!baseline ? (
        <button
          type="button"
          onClick={() => onRequestDelete(status)}
          aria-label="Delete status"
          className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors duration-100 hover:bg-destructive/10 hover:text-destructive active:scale-[0.97]"
        >
          <Trash className="h-4 w-4" />
        </button>
      ) : (
        <div className="h-8 w-8" aria-hidden />
      )}
    </div>
  )
}
