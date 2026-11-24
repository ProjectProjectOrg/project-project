import { useAtom } from "@effect/atom-react"
import { Button } from "@pp/ui/button"
import { useParams } from "@tanstack/react-router"

import { describeCause } from "@/lib/errorMessage"
import { m } from "@/paraglide/messages"

import {
  ticketActionFailures,
  type TicketAction
} from "../atoms/ticketActionFailures"

const failureMessage = (input: TicketAction, message: string) => {
  if (input.kind === "mark")
    return m.tickets_mark_save_failed({
      source: input.source,
      target: input.target,
      message
    })
  const [ticket] = input.tickets
  const count = input.tickets.length
  switch (input.kind) {
    case "unarchive":
      return m.tickets_unarchive_failed({ ticket, message })
    case "archive":
      return count === 1
        ? m.tickets_archive_failed_one({ ticket, message })
        : m.tickets_archive_failed({ count, message })
    case "delete":
      return count === 1
        ? m.tickets_delete_failed({ ticket, message })
        : m.tickets_delete_many_failed({ count, message })
  }
}

export function TicketActionFailures({
  orgSlug
}: Readonly<{ orgSlug: string }>) {
  const { slug } = useParams({ strict: false })
  const [failures, setFailures] = useAtom(ticketActionFailures(orgSlug))
  return failures
    .filter((failure) => !slug || slug === failure.slug)
    .map((failure) => (
      <div
        key={failure.key}
        role="alert"
        className="flex items-center gap-2 text-caption"
      >
        <span>
          {failureMessage(failure.input, describeCause(failure.cause))}
        </span>
        <Button variant="ghost" size="sm" onClick={failure.retry}>
          {m.tickets_selection_retry()}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            setFailures((items) => items.filter((item) => item !== failure))
          }
        >
          {m.common_close()}
        </Button>
      </div>
    ))
}
