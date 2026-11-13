import { Archive, MoreHorizontal } from "lucide-react"
import type { ReactNode } from "react"

import { Button } from "@/components/ui/button"
import { TicketPageShell } from "@/features/tickets/components/ticket-page/TicketPageShell"
import { useProjectActor } from "@/hooks/useActor"
import { m } from "@/paraglide/messages"

export function TicketPageLoading({
  back,
  stepper,
  title
}: Readonly<{
  back: ReactNode
  stepper: ReactNode
  title: string | null
}>) {
  const actor = useProjectActor()
  return (
    <TicketPageShell
      back={back}
      actions={
        <>
          {stepper}
          {actor.call("tickets", "archive") && (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={m.tickets_archive_action_aria_label()}
              disabled
            >
              <Archive strokeWidth={1.75} />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={m.tickets_row_actions_aria_label()}
            disabled
          >
            <MoreHorizontal strokeWidth={1.75} />
          </Button>
        </>
      }
      header={null}
      aside={
        <aside className="flex min-w-0 flex-col gap-5 px-2 lg:pt-3 lg:pl-5">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex flex-col gap-1.5">
              <div className="skeleton h-4 w-14 rounded bg-muted/60" />
              <div className="skeleton h-6 w-24 rounded bg-muted/60" />
            </div>
          ))}
        </aside>
      }
    >
      <main className="flex min-w-0 flex-col gap-3">
        <header className="flex min-w-0 flex-col items-start gap-1">
          {title === null ? (
            <div className="skeleton my-2 ml-2 h-7 w-1/2 rounded bg-muted/60" />
          ) : (
            <h1 className="block w-full px-2 py-1.5 text-display-compact font-semibold wrap-anywhere">
              {title}
            </h1>
          )}
          <div className="min-h-8" />
        </header>
        <div className="skeleton mx-2 min-h-[8rem] rounded-lg bg-muted/60" />
      </main>
    </TicketPageShell>
  )
}
