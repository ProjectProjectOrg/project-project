import { Checkbox } from "@pp/ui/checkbox"
import { chipClassName } from "@pp/ui/chip"
import { Flag } from "@pp/ui/icons"
import { ItemLink } from "@pp/ui/item-link"
import { ListRow, ListRowTitle } from "@pp/ui/list-row"
import { ListRowCrumbs, type ListRowCrumb } from "@pp/ui/list-row-crumbs"
import { TicketKey } from "@pp/ui/ticket-key"

import {
  AssigneeField,
  EstimateChip,
  FlagChip,
  GitChip,
  PriorityField,
  RelationChip,
  StatusField,
  SubTicketCount,
  TagChips,
  type SampleTicket
} from "./tickets"

// A row's parent in front of its title (its epic, or the ticket it's a
// sub-ticket of): a link, as its title or, when the row is tight, as its key.
export function parentCrumbs(
  ticket: SampleTicket
): ReadonlyArray<ListRowCrumb> {
  return [ticket.parent].flatMap((parent) =>
    parent === undefined
      ? []
      : [
          {
            id: parent.id,
            full: (
              <a
                href={`#${parent.id}`}
                title={parent.title}
                onClick={(event) => event.preventDefault()}
                className="relative z-20 max-w-48 truncate text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
              >
                {parent.title}
              </a>
            ),
            short: (
              <a
                href={`#${parent.id}`}
                title={parent.title}
                aria-label={parent.title}
                onClick={(event) => event.preventDefault()}
                className="relative z-20 flex underline-offset-4 hover:underline"
              >
                <TicketKey value={parent.id} />
              </a>
            )
          }
        ]
  )
}

// A ticket row as the app's list renders it: every slot filled.
export function Row({
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
          <ListRowCrumbs crumbs={parentCrumbs(ticket)} />
          <ListRowTitle>{ticket.title}</ListRowTitle>
          <span className="ml-1 flex items-center">
            <FlagChip flagged={ticket.flagged} />
          </span>
          <span className="ml-1 flex items-center">
            <SubTicketCount ticket={ticket} />
          </span>
        </>
      }
      trailing={
        <>
          <span className="flex items-center gap-1.5 *:max-w-32 empty:hidden">
            <TagChips ticket={ticket} max={3} collapse />
          </span>
          <GitChip pr={ticket.pr} />
          <RelationChip count={ticket.links} />
          <SprintChip sprint={ticket.sprint} />
        </>
      }
      estimate={<EstimateChip estimate={ticket.estimate} />}
      assignee={<AssigneeField assignee={ticket.assignee} size={20} />}
    />
  )
}

function SprintChip({ sprint }: Readonly<{ sprint?: string }>) {
  if (!sprint) return null
  return (
    <button
      type="button"
      aria-label={`Sprint: ${sprint}`}
      className={chipClassName({
        interaction: "press",
        className: "max-w-[14ch] gap-1"
      })}
    >
      <Flag className="size-3 shrink-0" strokeWidth={1.75} />
      <span className="truncate">{sprint}</span>
    </button>
  )
}
