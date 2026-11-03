import { useAtomValue } from "@effect/atom-react"
import type { TicketDetail } from "@pp/shared"
import { Link } from "@tanstack/react-router"
import { useState } from "react"

import { NotFoundPage } from "@/components/shell/NotFoundPage"
import { Button } from "@/components/ui/button"
import { useProjectRoute } from "@/features/projects/hooks/useProject"
import {
  ticketBodyDraft,
  ticketRequest
} from "@/features/tickets/atoms/ticketDetail"
import { m } from "@/paraglide/messages"

const COPIED_FOR_MS = 2000

const idSize = (id: string) => {
  if (id.length <= 7) return "text-5xl"
  if (id.length <= 10) return "text-4xl"
  return "text-3xl"
}

function CopyUnsaved({ body }: Readonly<{ body: string }>) {
  const [copied, setCopied] = useState(false)
  const copy = () =>
    navigator.clipboard.writeText(body).then(
      () => {
        setCopied(true)
        window.setTimeout(() => setCopied(false), COPIED_FOR_MS)
      },
      () => {}
    )
  return (
    <Button variant="secondary" size="lg" className="w-full" onClick={copy}>
      {copied ? m.tickets_deleted_copied() : m.tickets_deleted_copy_unsaved()}
    </Button>
  )
}

export function DeletedTicketPage({
  ticket
}: Readonly<{ ticket: TicketDetail }>) {
  const { orgSlug, slug } = useProjectRoute()
  const draft = useAtomValue(
    ticketBodyDraft(ticketRequest(orgSlug, slug, ticket.id))
  )
  const unsaved =
    draft !== null && draft.body !== ticket.body && draft.body.trim() !== ""
      ? draft.body
      : null

  return (
    <NotFoundPage
      contained
      code={<span className={idSize(ticket.id)}>{ticket.id}</span>}
      title={m.tickets_deleted_title()}
      body={m.tickets_deleted_body()}
      actions={
        <>
          {unsaved !== null && <CopyUnsaved body={unsaved} />}
          <Button
            variant="primary"
            size="lg"
            className="w-full"
            render={
              <Link
                to="/orgs/$orgSlug/projects/$slug"
                params={{ orgSlug, slug }}
              />
            }
          >
            {m.tickets_deleted_back()}
          </Button>
        </>
      }
    />
  )
}
