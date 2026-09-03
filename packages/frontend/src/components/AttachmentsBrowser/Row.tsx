import { Link } from "@tanstack/react-router"
import { FileText } from "lucide-react"
import type { AttachmentRow, AttachmentStatus } from "@projectproject/shared"
import { formatBytes } from "@/lib/formatBytes"
import { m } from "@/paraglide/messages"
import { getLocale } from "@/paraglide/runtime"
import { cn } from "@/lib/utils"
import { hasThumbnail, isDeletable } from "./selection"

const STATUS_LABEL: Record<AttachmentStatus, () => string> = {
  live: m.attachments_status_live,
  orphaned: m.attachments_status_orphaned,
  pending: m.attachments_status_pending
}

export function Row({
  orgSlug,
  row,
  selected,
  onToggle,
  children
}: {
  orgSlug: string
  row: AttachmentRow
  selected: boolean
  onToggle: (id: string) => void
  children?: React.ReactNode
}) {
  const locale = getLocale()
  const selectable = isDeletable(row)

  return (
    <div className="group grid grid-cols-[24px_minmax(0,3fr)_minmax(0,1fr)_minmax(0,1fr)_auto_auto_auto_auto] items-center gap-3 border-b border-border px-2 py-2 text-sm transition-colors hover:bg-accent/60">
      <div className="flex items-center justify-center">
        {selectable ? (
          <input
            type="checkbox"
            className="size-4 rounded border border-border"
            checked={selected}
            onChange={() => onToggle(row.id)}
            aria-label={m.attachments_select_row({ filename: row.filename })}
          />
        ) : null}
      </div>

      <div className="flex min-w-0 items-center gap-2.5">
        <Thumbnail row={row} />
        <span className="truncate font-mono text-[13px]">{row.filename}</span>
      </div>

      <span className="truncate text-muted-foreground">{row.projectSlug}</span>

      <Link
        to="/orgs/$orgSlug/projects/$slug/tickets/$id"
        params={{ orgSlug, slug: row.projectSlug, id: row.ticketId }}
        className="truncate font-mono text-[13px] text-muted-foreground transition-colors hover:text-foreground"
      >
        {row.ticketId}
      </Link>

      <span className="whitespace-nowrap tabular-nums text-muted-foreground">
        {formatBytes(row.byteSize, locale)}
      </span>

      <span
        className={cn(
          "whitespace-nowrap text-xs",
          row.status === "orphaned"
            ? "text-foreground"
            : "text-muted-foreground"
        )}
      >
        {STATUS_LABEL[row.status]()}
      </span>

      <span className="whitespace-nowrap text-xs text-muted-foreground">
        {row.createdAt.toLocaleDateString(locale)}
      </span>

      {children}
    </div>
  )
}

function Thumbnail({ row }: { row: AttachmentRow }) {
  if (!hasThumbnail(row)) {
    return (
      <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground">
        <FileText className="size-4" strokeWidth={1.75} />
      </span>
    )
  }
  return (
    <img
      src={row.url}
      alt={m.attachments_thumbnail_alt({ filename: row.filename })}
      loading="lazy"
      className="size-8 shrink-0 rounded-md border border-border object-cover"
    />
  )
}
