import { ItemLink } from "@pp/ui/item-link"
import { ListRow, ListRowTitle, listGridClassName } from "@pp/ui/list-row"
import { ListSectionBody, ListSectionHeader } from "@pp/ui/list-section"
import { StatusLock, StatusLockNote } from "@pp/ui/status-lock"
import { TicketKey } from "@pp/ui/ticket-key"
import { useState } from "react"

import {
  AUDIT,
  CRASH,
  FOCUS,
  INVITED,
  PriorityField,
  StatusField,
  StatusIcon,
  type SampleTicket,
  type Status
} from "../../../components/list-row/demos/parts/tickets"
import {
  dragReason,
  dragTitle,
  LOCKED,
  lockLabel,
  lockReason,
  RoleTabs,
  type Role
} from "./parts/lock"

type Refusal = "dragging" | "over" | null

function Section({
  status,
  label,
  tickets,
  role,
  refusal
}: Readonly<{
  status: Status
  label: string
  tickets: ReadonlyArray<SampleTicket>
  role: Role
  refusal: Refusal
}>) {
  const [collapsed, setCollapsed] = useState(false)
  const locked = status in LOCKED
  const refuses = locked && role !== "pm"
  return (
    <div
      className="flex flex-col rounded-[20px]"
      data-refusing={(refuses && refusal) || undefined}
    >
      <ListSectionHeader
        icon={<StatusIcon status={status} />}
        label={label}
        count={tickets.length}
        countLabel={`${tickets.length} tickets`}
        lock={
          locked ? (
            <StatusLock label={lockLabel} reason={lockReason(status, role)} />
          ) : undefined
        }
        collapsed={collapsed}
        onToggleCollapsed={() => setCollapsed((current) => !current)}
        collapseLabel={`Toggle section ${label}`}
      />
      {locked ? (
        <StatusLockNote
          refusal={refusal}
          title={dragTitle(role)}
          reason={dragReason(status, role)}
          className="mt-1"
        />
      ) : null}
      <ListSectionBody collapsed={collapsed}>
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
      </ListSectionBody>
    </div>
  )
}

function List({
  role,
  refusal
}: Readonly<{ role: Role; refusal: Refusal }>) {
  return (
    <div
      className="@container flex w-full flex-col gap-3 rounded-xl surface-page p-3"
      style={{ "--ticket-key-width": "6ch" }}
    >
      <Section
        status="progress"
        label="In progress"
        tickets={[AUDIT, INVITED]}
        role={role}
        refusal={null}
      />
      <Section
        status="review"
        label="In review"
        tickets={[FOCUS]}
        role={role}
        refusal={refusal}
      />
      <Section
        status="done"
        label="Done"
        tickets={[CRASH]}
        role={role}
        refusal={refusal === "over" ? "dragging" : refusal}
      />
    </div>
  )
}

export default function LockedList() {
  const [role, setRole] = useState<Role>("developer")
  return (
    <div className="flex w-full flex-col gap-6">
      <RoleTabs role={role} onRole={setRole} />
      <div className="flex flex-col gap-2">
        <span className="text-caption text-muted-foreground">At rest</span>
        <List role={role} refusal={null} />
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-caption text-muted-foreground">
          Dragging a row from In progress, pointer over In review
        </span>
        <List role={role} refusal="over" />
      </div>
    </div>
  )
}
