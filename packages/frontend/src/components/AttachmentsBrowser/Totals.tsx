import type {
  AttachmentStatus,
  AttachmentSummary
} from "@projectproject/shared"
import { formatBytes } from "@/lib/formatBytes"
import { m } from "@/paraglide/messages"
import { getLocale } from "@/paraglide/runtime"

const STATUS_LABEL: Record<AttachmentStatus, () => string> = {
  live: m.attachments_status_live,
  orphaned: m.attachments_status_orphaned,
  pending: m.attachments_status_pending
}

const ORDER = ["live", "orphaned", "pending"] as const

export function Totals({ summary }: { summary: AttachmentSummary }) {
  const locale = getLocale()
  const byStatus = new Map(summary.byStatus.map((row) => [row.status, row]))

  return (
    <div className="flex flex-wrap items-baseline gap-x-8 gap-y-2 rounded-lg border border-border bg-background px-4 py-3">
      <Total
        label={m.attachments_totals_all()}
        count={summary.count}
        bytes={summary.bytes}
        locale={locale}
      />
      {ORDER.map((status) => {
        const row = byStatus.get(status)
        return (
          <Total
            key={status}
            label={STATUS_LABEL[status]()}
            count={row?.count ?? 0}
            bytes={row?.bytes ?? 0}
            locale={locale}
            muted
          />
        )
      })}
    </div>
  )
}

function Total({
  label,
  count,
  bytes,
  locale,
  muted
}: {
  label: string
  count: number
  bytes: number
  locale: string
  muted?: boolean
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span
        className={
          muted ? "text-sm text-muted-foreground" : "text-sm font-medium"
        }
      >
        {m.attachments_total_bytes({
          bytes: formatBytes(bytes, locale),
          count
        })}
      </span>
    </div>
  )
}
