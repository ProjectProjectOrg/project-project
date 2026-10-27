import { useAtomSet, useAtomValue } from "@effect/atom-react"
import type { Member, TicketId } from "@pp/shared"
import * as Result from "effect/unstable/reactivity/AsyncResult"
import { useMemo } from "react"

import { ErrorPage } from "@/components/ErrorPage"
import { Row, rowGridClassName } from "@/components/TicketList/Row"
import { TicketComposer } from "@/components/TicketList/TicketComposer"
import { useTicketPreview } from "@/components/TicketList/useTicketPreview"
import {
  quickCreateSubTicket,
  subTickets,
  subTicketsRequest,
  updateSubTicket,
  type SubTicketRow,
  type SubTicketsRequest
} from "@/features/tickets/atoms/epics"
import { NON_EPIC_TYPES } from "@/lib/ticket-meta"
import { m } from "@/paraglide/messages"

import { CollapsibleSection } from "./CollapsibleSection"

type TicketPreview = ReturnType<typeof useTicketPreview>

export function SubTicketsSection({
  orgSlug,
  slug,
  epicId,
  members
}: Readonly<{
  orgSlug: string
  slug: string
  epicId: TicketId
  members: ReadonlyArray<Member>
}>) {
  const req = useMemo(
    () => subTicketsRequest(orgSlug, slug, epicId),
    [orgSlug, slug, epicId]
  )
  const result = useAtomValue(subTickets(req))
  const create = useAtomSet(quickCreateSubTicket(req), { mode: "promiseExit" })
  const createState = useAtomValue(quickCreateSubTicket(req))
  const preview = useTicketPreview()
  const count = Result.isSuccess(result) ? result.value.length : 0

  return (
    <CollapsibleSection
      heading={
        count > 0
          ? m.tickets_sub_tickets_heading_with_count({ count })
          : m.tickets_sub_tickets_heading()
      }
    >
      <div className="mb-3">
        <TicketComposer
          orgSlug={orgSlug}
          slug={slug}
          types={NON_EPIC_TYPES}
          parent={epicId}
          create={create}
          createState={createState}
        />
      </div>
      {Result.matchWithError(result, {
        onInitial: () => null,
        onError: (error) => <ErrorPage error={error} contained />,
        onDefect: (defect) => <ErrorPage error={defect} contained />,
        onSuccess: ({ value }) => (
          <div className={rowGridClassName}>
            {value.map((row) => (
              <SubTicketListRow
                key={row.key}
                req={req}
                row={row}
                members={members}
                preview={preview}
              />
            ))}
          </div>
        )
      })}
    </CollapsibleSection>
  )
}

function SubTicketListRow({
  req,
  row,
  members,
  preview
}: Readonly<{
  req: SubTicketsRequest
  row: SubTicketRow
  members: ReadonlyArray<Member>
  preview: TicketPreview
}>) {
  const update = useAtomSet(updateSubTicket({ req, id: row.ticket.id }))
  return (
    <Row
      orgSlug={req.params.orgSlug}
      slug={req.params.slug}
      ticket={row.ticket}
      members={members}
      showParent={false}
      pending={row.pending}
      previewOpen={preview.activePreviewId === row.ticket.id}
      onPreviewPointerEnter={preview.onPreviewPointerEnter}
      onPreviewOpenChange={preview.onPreviewOpenChange}
      onUpdate={update}
    />
  )
}
