import type { ReactNode } from "react"
import { StatusButton } from "@/components/TicketList/StatusField"
import { TitleField } from "@/components/TicketPage/TitleField"
import type { TicketDetail, UpdateTicketInput } from "@projectproject/shared"

export function TicketPageHeader({
  orgSlug,
  slug,
  ticket,
  readOnly = false,
  onPatch,
  meta
}: {
  orgSlug: string
  slug: string
  ticket: TicketDetail
  readOnly?: boolean
  onPatch?: (patch: UpdateTicketInput) => void
  meta?: ReactNode
}) {
  return (
    <header className="flex items-start gap-2">
      <div className="mt-1.5 flex h-[1lh] shrink-0 items-center text-xl">
        <StatusButton
          orgSlug={orgSlug}
          slug={slug}
          ticket={ticket}
          size="lg"
          disabled={readOnly}
          onPatch={onPatch ?? noopPatch}
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

const noopPatch = (_patch: UpdateTicketInput) => {}
