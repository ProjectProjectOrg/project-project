import {
  BoardCard,
  BoardCardSubTicket,
  BoardCardSubTickets,
  BoardCardSubTicketsMore,
  BoardCardSubTicketsNote,
  subTicketsShown
} from "@pp/ui/board-card"
import { ItemLink } from "@pp/ui/item-link"
import { TicketKey } from "@pp/ui/ticket-key"
import { useState, type ReactNode } from "react"

import {
  AssigneeField,
  CardProperties,
  EVERYTHING,
  ParentCrumb,
  StatusIcon,
  INVITED,
  AUDIT,
  FOCUS,
  CRASH,
  type SampleTicket
} from "../../list-row/demos/parts/tickets"

const SUB_TICKETS = [
  {
    id: "ATL-24",
    status: "done",
    title: "Announce focus changes to screen readers"
  },
  { id: "ATL-25", status: "progress", title: "Contrast of disabled fields" },
  {
    id: "ATL-26",
    status: "todo",
    title: "Larger tap targets on checklist steps"
  },
  { id: "ATL-27", status: "todo", title: "Label the photo buttons" },
  { id: "ATL-28", status: "todo", title: "Read out step progress" }
] as const

function SubTickets() {
  const [all, setAll] = useState(false)
  const preview = subTicketsShown(SUB_TICKETS.length)
  const shown = all ? SUB_TICKETS : SUB_TICKETS.slice(0, preview)
  const hidden = SUB_TICKETS.length - preview
  return (
    <div className="pt-2">
      <BoardCardSubTickets>
        {shown.map((sub) => (
          <BoardCardSubTicket
            key={sub.id}
            status={<StatusIcon status={sub.status} />}
            ticketKey={sub.id}
            keyWidth="6ch"
            title={sub.title}
            href={`#${sub.id}`}
            onClick={(event) => event.preventDefault()}
          />
        ))}
        {hidden > 0 ? (
          <BoardCardSubTicketsMore
            onClick={() => setAll((current) => !current)}
          >
            {all ? "Show less" : `Show ${hidden} more`}
          </BoardCardSubTicketsMore>
        ) : null}
      </BoardCardSubTickets>
    </div>
  )
}

function LoadingSubTickets() {
  return (
    <div className="pt-2">
      <BoardCardSubTickets>
        <BoardCardSubTicketsNote loading>
          Loading sub-tickets…
        </BoardCardSubTicketsNote>
      </BoardCardSubTickets>
    </div>
  )
}

function Card({
  ticket,
  force,
  children
}: Readonly<{ ticket: SampleTicket; force?: string; children?: ReactNode }>) {
  return (
    <BoardCard
      data-force={force}
      link={
        <ItemLink
          href={`#${ticket.id}`}
          aria-label={`${ticket.id} ${ticket.title}`}
          onClick={(event) => event.preventDefault()}
        />
      }
      meta={
        <>
          <TicketKey value={ticket.id} />
          {ticket.parent ? <ParentCrumb title={ticket.parent} /> : null}
        </>
      }
      assignee={<AssigneeField assignee={ticket.assignee} size={20} />}
      title={ticket.title}
      properties={<CardProperties ticket={ticket} />}
      flagged={ticket.flagged}
    >
      {children}
    </BoardCard>
  )
}

function Column({
  label,
  children
}: Readonly<{ label: string; children: ReactNode }>) {
  return (
    <section className="flex min-w-0 flex-col gap-2 rounded-2xl bg-muted/60 p-2.5">
      <h3 className="px-1.5 pt-1 text-caption text-muted-foreground">
        {label}
      </h3>
      {children}
    </section>
  )
}

export default function Overview() {
  return (
    <div className="@container w-full">
      <div className="grid grid-cols-1 gap-3 @xl:grid-cols-[repeat(2,minmax(0,1fr))] @4xl:grid-cols-[repeat(4,minmax(0,1fr))]">
        <Column label="Cards: click one, hover its chips">
          <Card ticket={INVITED} />
          <Card ticket={AUDIT} />
        </Column>
        <Column label="Hover · sub-ticket with its parent">
          <Card ticket={INVITED} force="hover" />
          <Card ticket={FOCUS} />
        </Column>
        <Column label="Sub-tickets: expanded, loading">
          <Card ticket={AUDIT}>
            <SubTickets />
          </Card>
          <Card ticket={{ ...INVITED, id: "ATL-30" }}>
            <LoadingSubTickets />
          </Card>
        </Column>
        <Column label="Everything on it">
          <Card ticket={EVERYTHING}>
            <SubTickets />
          </Card>
        </Column>
        <Column label="Long title, clamped to two lines">
          <Card ticket={CRASH} />
          <Card
            ticket={{
              ...FOCUS,
              id: "ATL-25",
              parent: undefined,
              pr: undefined
            }}
          />
        </Column>
      </div>
    </div>
  )
}
