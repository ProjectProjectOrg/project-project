import { Checkbox } from "@pp/ui/checkbox"
import { ItemLink } from "@pp/ui/item-link"
import {
  ListHoverScope,
  ListRow,
  ListRowTitle,
  listGridClassName
} from "@pp/ui/list-row"
import { TicketKey } from "@pp/ui/ticket-key"
import { useState } from "react"

import {
  AssigneeField,
  EstimateChip,
  GitChip,
  ParentPrefix,
  PriorityField,
  RelationChip,
  StatusField,
  SubTicketCount,
  TagChips,
  TICKETS,
  INVITED,
  AUDIT,
  FOCUS,
  CRASH,
  type SampleTicket
} from "./parts/tickets"

function Row({
  ticket,
  force,
  selected = false,
  pending = false,
  disabled = false,
  onSelect
}: Readonly<{
  ticket: SampleTicket
  force?: string
  selected?: boolean
  pending?: boolean
  disabled?: boolean
  onSelect?: (selected: boolean) => void
}>) {
  return (
    <ListRow
      data-force={force}
      selected={selected}
      disabled={disabled}
      link={
        <ItemLink
          href={`#${ticket.id}`}
          aria-label={`${ticket.id} ${ticket.title}`}
          onClick={(event) => event.preventDefault()}
        />
      }
      lead={
        <Checkbox
          checked={selected}
          onCheckedChange={(checked) => onSelect?.(checked)}
          aria-label={`Select ${ticket.id}`}
          variant="quiet"
          className="opacity-0 group-hover/reveal:opacity-100 group-data-[force~=hover]/reveal:opacity-100 data-checked:opacity-100"
        />
      }
      status={<StatusField status={ticket.status} />}
      priority={<PriorityField priority={ticket.priority} />}
      ticketKey={
        <TicketKey
          value={ticket.id}
          pending={pending}
          className="min-w-(--ticket-key-width)"
        />
      }
      title={
        <>
          {ticket.parent ? <ParentPrefix title={ticket.parent} /> : null}
          <ListRowTitle>{ticket.title}</ListRowTitle>
          <span className="ml-1 flex items-center">
            <SubTicketCount ticket={ticket} />
          </span>
        </>
      }
      trailing={
        <>
          <span className="flex items-center gap-1.5 *:max-w-32 empty:hidden">
            <TagChips ticket={ticket} />
          </span>
          <GitChip pr={ticket.pr} />
          <RelationChip count={ticket.links} />
        </>
      }
      estimate={<EstimateChip estimate={ticket.estimate} />}
      assignee={<AssigneeField assignee={ticket.assignee} size={20} />}
    />
  )
}

function Caption({ children }: Readonly<{ children: string }>) {
  return (
    <p className="col-span-full px-3 pt-4 text-caption text-muted-foreground first:pt-0">
      {children}
    </p>
  )
}

export default function Overview() {
  const [selected, setSelected] = useState<ReadonlySet<string>>(
    () => new Set(["ATL-22"])
  )
  const toggle = (id: string) => (on: boolean) =>
    setSelected((current) => {
      const next = new Set(current)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })
  return (
    <div
      className="@container w-full rounded-xl bg-page p-3"
      style={{ "--ticket-key-width": "6ch" }}
    >
      <ListHoverScope className={listGridClassName}>
        <Caption>Rows: move down the list, click a checkbox to select</Caption>
        {TICKETS.map((ticket) => (
          <Row
            key={ticket.id}
            ticket={ticket}
            selected={selected.has(ticket.id)}
            onSelect={toggle(ticket.id)}
          />
        ))}
      </ListHoverScope>
      <div className={listGridClassName}>
        <Caption>Hover</Caption>
        <Row ticket={INVITED} force="hover" />
        <Caption>Selected</Caption>
        <Row ticket={AUDIT} selected />
        <Caption>Being created: the number rolls in once saved</Caption>
        <Row ticket={{ ...FOCUS, id: "ATL-25" }} pending />
        <Caption>Read only: the fields are disabled</Caption>
        <Row ticket={CRASH} disabled />
      </div>
    </div>
  )
}
