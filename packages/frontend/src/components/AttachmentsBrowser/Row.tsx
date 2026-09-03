import { Link } from "@tanstack/react-router"
import { FileText } from "lucide-react"
import type { AttachmentRow, AttachmentStatus } from "@projectproject/shared"
import { formatBytes } from "@/lib/formatBytes"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"
import { getLocale } from "@/paraglide/runtime"
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

  return (
    <tr className="group border-b border-border transition-colors hover:bg-accent/60">
      <td className="w-6 px-2 py-2 align-middle">
        {isDeletable(row) ? (
          <input
            type="checkbox"
            className="size-4 rounded border border-border align-middle"
            checked={selected}
            onChange={() => onToggle(row.id)}
            aria-label={m.attachments_select_row({ filename: row.filename })}
          />
        ) : null}
      </td>

      <td className="w-full max-w-0 px-2 py-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <Thumbnail row={row} />
          <span className="truncate font-mono text-[13px]">{row.filename}</span>
        </div>
      </td>

      <td className="max-w-[180px] truncate px-2 py-2 text-sm text-muted-foreground">
        {row.projectSlug}
      </td>

      <td className="px-2 py-2">
        <Link
          to="/orgs/$orgSlug/projects/$slug/tickets/$id"
          params={{ orgSlug, slug: row.projectSlug, id: row.ticketId }}
          className="font-mono text-[13px] text-muted-foreground transition-colors hover:text-foreground"
        >
          {row.ticketId}
        </Link>
      </td>

      <td className="px-2 py-2 text-right text-sm tabular-nums whitespace-nowrap text-muted-foreground">
        {formatBytes(row.byteSize, locale)}
      </td>

      <td
        className={cn(
          "px-2 py-2 text-sm whitespace-nowrap",
          row.status === "orphaned"
            ? "text-foreground"
            : "text-muted-foreground"
        )}
      >
        {STATUS_LABEL[row.status]()}
      </td>

      <td className="px-2 py-2 text-sm whitespace-nowrap text-muted-foreground">
        {row.createdAt.toLocaleDateString(locale)}
      </td>

      <td className="px-2 py-2 text-right whitespace-nowrap">{children}</td>
    </tr>
  )
}

function Thumbnail({ row }: { row: AttachmentRow }) {
  if (!hasThumbnail(row)) {
    return (
      <span className="flex size-8 shrink-0 items-center justify-center rounded-[7px] border border-border text-muted-foreground">
        <FileText className="size-4" strokeWidth={1.75} />
      </span>
    )
  }
  return (
    <img
      src={row.url}
      alt={m.attachments_thumbnail_alt({ filename: row.filename })}
      loading="lazy"
      className="size-8 shrink-0 rounded-[7px] border border-border object-cover"
    />
  )
}
