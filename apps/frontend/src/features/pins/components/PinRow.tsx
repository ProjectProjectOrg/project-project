import { useAtomSet } from "@effect/atom-react"
import { sprintState, type PinTarget, type SidebarPin } from "@pp/shared"
import { Pin, PinOff } from "@pp/ui/icons"
import { SidebarRow, SidebarRowAction } from "@pp/ui/sidebar"
import { Link } from "@tanstack/react-router"

import { pinItem, pinsRequest, unpinItem } from "@/features/pins/atoms/pins"
import type { PinPrediction } from "@/features/pins/lib/pins"
import {
  countdownLabel,
  SprintStateIcon
} from "@/features/sprints/components/SprintChip"
import { sprintCountdown } from "@/features/sprints/lib/sprintDates"
import { TicketStatusIcon } from "@/features/tickets/components/ticket-marks/TicketStatusIcon"
import { m } from "@/paraglide/messages"

type PinRowProps = Readonly<{
  orgSlug: string
  slug: string
  target: PinTarget
  display: PinPrediction
  active: boolean
  highlight?: boolean
  onPinned?: () => void
}>

export const predictionOf = (pin: SidebarPin): PinPrediction =>
  pin.kind === "ticket" ? { ticket: pin.ticket } : { sprint: pin.sprint }

export function PinRow(props: PinRowProps & Readonly<{ pinned: boolean }>) {
  const req = pinsRequest(props.orgSlug)
  const pin = useAtomSet(pinItem({ req, slug: props.slug }))
  const unpin = useAtomSet(
    unpinItem({
      req,
      slug: props.slug,
      kind: props.target.kind,
      ref: props.target.ref
    })
  )
  return (
    <PinRowView
      {...props}
      live={!props.pinned}
      action={
        props.pinned ? (
          <SidebarRowAction
            label={m.chrome_sidebar_unpin()}
            onClick={() => unpin()}
          >
            <PinOff />
          </SidebarRowAction>
        ) : (
          <SidebarRowAction
            label={m.chrome_sidebar_pin()}
            onClick={() => {
              props.onPinned?.()
              pin({ payload: props.target, prediction: props.display })
            }}
          >
            <Pin />
          </SidebarRowAction>
        )
      }
    />
  )
}

function PinRowView({
  orgSlug,
  slug,
  display,
  active,
  highlight = false,
  live,
  action
}: PinRowProps & Readonly<{ live: boolean; action: React.ReactNode }>) {
  if ("ticket" in display) {
    const { ticket } = display
    return (
      <SidebarRow
        live={live}
        active={active}
        highlight={highlight}
        icon={
          <TicketStatusIcon
            status={ticket.status}
            orgSlug={orgSlug}
            slug={slug}
          />
        }
        label={ticket.title}
        meta={<span className="text-micro tabular-nums">{ticket.id}</span>}
        className={ticket.archivedAt === null ? undefined : "opacity-60"}
        action={action}
        render={
          <Link
            activeOptions={{ exact: true, includeSearch: false }}
            to="/orgs/$orgSlug/projects/$slug/tickets/$id"
            params={{ orgSlug, slug, id: ticket.id }}
          />
        }
      />
    )
  }
  const { sprint } = display
  return (
    <SidebarRow
      live={live}
      active={active}
      highlight={highlight}
      icon={<SprintStateIcon sprint={sprint} size="sm" />}
      label={sprint.name}
      meta={
        sprintState(sprint) === "active"
          ? countdownLabel(sprintCountdown(sprint))
          : undefined
      }
      action={action}
      render={
        <Link
          activeOptions={{ exact: true, includeSearch: false }}
          to="/orgs/$orgSlug/projects/$slug/sprints/$groupId"
          params={{ orgSlug, slug, groupId: sprint.id }}
        />
      }
    />
  )
}
