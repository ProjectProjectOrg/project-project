import { BoardCard } from "@pp/ui/board-card"
import { ItemLink } from "@pp/ui/item-link"
import { TicketKey } from "@pp/ui/ticket-key"

import {
  AssigneeField,
  EstimateChip,
  GitChip,
  ParentCrumb,
  PriorityChip,
  RelationChip,
  SubTicketCount,
  TagChips,
  INVITED,
  AUDIT,
  FOCUS,
  CRASH,
  type SampleTicket
} from "../../list-row/demos/parts/tickets"

function Card({
  ticket,
  force
}: Readonly<{ ticket: SampleTicket; force?: string }>) {
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
      assignee={<AssigneeField assignee={ticket.assignee} />}
      title={ticket.title}
      properties={
        <>
          <PriorityChip priority={ticket.priority} />
          <SubTicketCount ticket={ticket} />
          <TagChips ticket={ticket} />
          <GitChip pr={ticket.pr} />
          <RelationChip count={ticket.links} />
          <EstimateChip estimate={ticket.estimate} />
        </>
      }
    />
  )
}

function Column({
  label,
  children
}: Readonly<{ label: string; children: React.ReactNode }>) {
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
      <div className="grid grid-cols-1 gap-3 @xl:grid-cols-[repeat(3,minmax(0,1fr))]">
        <Column label="Cards: click one, hover its chips">
          <Card ticket={INVITED} />
          <Card ticket={AUDIT} />
        </Column>
        <Column label="Hover · sub-ticket with its parent">
          <Card ticket={INVITED} force="hover" />
          <Card ticket={FOCUS} />
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
