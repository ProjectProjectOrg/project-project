import type { ReactNode } from "react"
import { StatusButton } from "@/components/TicketList/StatusField"
import { TitleField } from "@/components/TicketPage/TitleField"
import type { TicketDetail } from "@projectproject/shared"

const HEADER_STATUS_QUERY = {
  sort: { key: "updated", dir: "desc" }
} as const

export function TicketPageHeader({
  orgSlug,
  slug,
  ticket,
  readOnly = false,
  meta
}: {
  orgSlug: string
  slug: string
  ticket: TicketDetail
  readOnly?: boolean
  meta?: ReactNode
}) {
  return (
    <header className="flex items-start gap-2">
      <div className="mt-1.5 flex h-[1lh] shrink-0 items-center text-xl">
        <StatusButton
          orgSlug={orgSlug}
          slug={slug}
          ticket={ticket}
          query={HEADER_STATUS_QUERY}
          size="lg"
          disabled={readOnly}
        />
      </div>
      <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
        <h1 className="w-full">
          {readOnly ? (
            <span className="block w-full break-words px-2 py-1.5 text-xl font-semibold">
              {ticket.title}
            </span>
          ) : (
            <TitleField
              key={ticket.id}
              orgSlug={orgSlug}
              slug={slug}
              ticket={ticket}
            />
          )}
        </h1>
        <div className="flex items-center gap-1.5 px-2">
          <span className="font-mono text-xs tabular-nums text-muted-foreground">
            {ticket.id}
          </span>
          {meta}
        </div>
      </div>
    </header>
  )
}
