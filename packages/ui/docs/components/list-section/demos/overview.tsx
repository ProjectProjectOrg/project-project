import { Chip } from "@pp/ui/chip"
import { CalendarRange, Flag, Gauge, Inbox } from "@pp/ui/icons"
import { ItemLink } from "@pp/ui/item-link"
import { ListRow, ListRowTitle, listGridClassName } from "@pp/ui/list-row"
import { ListSectionBody, ListSectionHeader } from "@pp/ui/list-section"
import { TicketKey } from "@pp/ui/ticket-key"
import { useState, type ReactNode } from "react"

import {
  AUDIT,
  CRASH,
  FOCUS,
  INVITED,
  PriorityField,
  StatusIcon,
  StatusField,
  type SampleTicket
} from "../../list-row/demos/parts/tickets"

function Rows({ tickets }: Readonly<{ tickets: ReadonlyArray<SampleTicket> }>) {
  return (
    <div className={listGridClassName}>
      {tickets.map((ticket) => (
        <ListRow
          key={ticket.id}
          link={
            <ItemLink
              href={`#${ticket.id}`}
              aria-label={`${ticket.id} ${ticket.title}`}
              onClick={(event) => event.preventDefault()}
            />
          }
          status={<StatusField status={ticket.status} />}
          priority={<PriorityField priority={ticket.priority} />}
          ticketKey={
            <TicketKey
              value={ticket.id}
              className="min-w-(--ticket-key-width)"
            />
          }
          title={<ListRowTitle>{ticket.title}</ListRowTitle>}
        />
      ))}
    </div>
  )
}

function Section({
  icon,
  label,
  detail,
  tickets,
  startCollapsed = false,
  canCreate = true
}: Readonly<{
  icon: ReactNode
  label: string
  detail?: ReactNode
  tickets: ReadonlyArray<SampleTicket>
  startCollapsed?: boolean
  canCreate?: boolean
}>) {
  const [collapsed, setCollapsed] = useState(startCollapsed)
  const [creating, setCreating] = useState(false)
  return (
    <div className="flex flex-col">
      <ListSectionHeader
        icon={icon}
        label={label}
        count={tickets.length}
        countLabel={`${tickets.length} tickets`}
        detail={detail}
        collapsed={collapsed}
        onToggleCollapsed={() => setCollapsed((current) => !current)}
        collapseLabel={`Toggle section ${label}`}
        create={
          canCreate
            ? {
                creating,
                creator: (
                  <input
                    // oxlint-disable-next-line jsx-a11y/no-autofocus -- the creator opens to type into
                    autoFocus
                    aria-label="New ticket title"
                    placeholder="New ticket title…"
                    onKeyDown={(event) => {
                      if (event.key === "Escape") setCreating(false)
                    }}
                    className="h-6 w-full bg-transparent text-body outline-none placeholder:text-muted-foreground"
                  />
                ),
                onStart: () => setCreating(true),
                onDismiss: () => setCreating(false),
                label: `Create ticket in ${label}`,
                dismissLabel: `Stop creating in ${label}`
              }
            : undefined
        }
      />
      <ListSectionBody collapsed={collapsed}>
        <Rows tickets={tickets} />
      </ListSectionBody>
    </div>
  )
}

export default function Overview() {
  return (
    <div
      className="@container flex w-full flex-col gap-3 rounded-xl bg-page p-3"
      style={{ "--ticket-key-width": "6ch" }}
    >
      <Section
        icon={<StatusIcon status="progress" />}
        label="In progress"
        tickets={[AUDIT, FOCUS]}
      />
      <Section
        icon={<Flag className="size-4" strokeWidth={1.75} />}
        label="Sprint 25"
        detail={
          <>
            <Chip>
              <CalendarRange className="size-3 shrink-0" strokeWidth={1.75} />
              Nov 23 – Dec 7
            </Chip>
            <Chip interaction="hover" className="tabular-nums">
              <Gauge className="size-3 shrink-0" strokeWidth={1.75} />
              12
            </Chip>
          </>
        }
        tickets={[INVITED, CRASH]}
      />
      <Section
        icon={<Inbox className="size-4" strokeWidth={1.75} />}
        label="Unscheduled · collapsed"
        tickets={[INVITED]}
        startCollapsed
      />
      <Section
        icon={<StatusIcon status="done" />}
        label="Done · read only"
        tickets={[CRASH]}
        canCreate={false}
      />
    </div>
  )
}
