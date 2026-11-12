import { useAtomValue } from "@effect/atom-react"
import {
  isEpic,
  type TicketDetail,
  type TicketNeighbor,
  type TicketViewSource
} from "@pp/shared"
import { Link, useRouter } from "@tanstack/react-router"
import * as Result from "effect/reactivity/AsyncResult"
import { ChevronDown, ChevronUp } from "lucide-react"
import { useEffect, useMemo, type ReactNode } from "react"

import { Button } from "@/components/ui/button"
import { useProjectRoute } from "@/features/projects/hooks/useProject"
import {
  ticketNeighbors,
  ticketNeighborsRequest
} from "@/features/tickets/atoms/ticketNeighbors"
import { TicketPreviewTrigger } from "@/features/tickets/components/ticket-preview/TicketPreview"
import {
  ticketSearchFromSource,
  type TicketDetailSearch,
  type TicketPageSource
} from "@/features/tickets/lib/ticketSearch"
import type { IconComponent } from "@/lib/icon"
import { hasModifier, ownsKeystrokes } from "@/lib/keyboard"
import { m } from "@/paraglide/messages"

const SIBLINGS: TicketViewSource = { kind: "siblings" }
const NO_SEARCH: TicketDetailSearch = {}
const PREVIOUS_KEY = "k"
const NEXT_KEY = "j"

type Step = Readonly<{
  neighbor: TicketNeighbor | null
  shortcut: string
  icon: IconComponent
  label: string
}>

export function TicketStepper({
  ticket,
  from
}: Readonly<{
  ticket: Pick<TicketDetail, "id" | "parent">
  from: TicketPageSource | undefined
}>) {
  const siblingSearch = useMemo(
    (): TicketDetailSearch =>
      from?.kind === "parent"
        ? { from: "parent", parentId: from.parent }
        : NO_SEARCH,
    [from]
  )
  const parent = ticket.parent
  const siblings =
    parent === null ? null : (
      <Stepper
        ticket={ticket}
        source={SIBLINGS}
        siblingSearch={siblingSearch}
        position={(position, total) =>
          isEpic(parent)
            ? m.tickets_stepper_epic_position({ position, total })
            : m.tickets_stepper_sub_ticket_position({ position, total })
        }
      />
    )
  if (from === undefined || from.kind === "parent") return siblings
  return (
    <Stepper
      ticket={ticket}
      source={from}
      position={(position, total) =>
        m.tickets_stepper_position({ position, total })
      }
      fallback={siblings}
    />
  )
}

function Stepper({
  ticket,
  source,
  position,
  siblingSearch = NO_SEARCH,
  fallback = null
}: Readonly<{
  ticket: Pick<TicketDetail, "id">
  source: TicketViewSource
  position: (position: number, total: number) => string
  siblingSearch?: TicketDetailSearch
  fallback?: ReactNode
}>) {
  const { orgSlug, slug } = useProjectRoute()
  const result = useAtomValue(
    ticketNeighbors(ticketNeighborsRequest(orgSlug, slug, ticket.id, source))
  )
  const router = useRouter()
  const search = useMemo(
    (): TicketDetailSearch =>
      source.kind === "siblings"
        ? siblingSearch
        : ticketSearchFromSource(source),
    [source, siblingSearch]
  )
  const neighbors = Result.isSuccess(result) ? result.value : null
  const prev = neighbors?.prev ?? null
  const next = neighbors?.next ?? null

  useEffect(() => {
    const options = (neighbor: TicketNeighbor) =>
      ({
        to: "/orgs/$orgSlug/projects/$slug/tickets/$id",
        params: { orgSlug, slug, id: neighbor.id },
        search
      }) as const
    for (const neighbor of [prev, next]) {
      if (neighbor !== null) void router.preloadRoute(options(neighbor))
    }
    function onKey(event: KeyboardEvent) {
      if (
        event.repeat ||
        event.defaultPrevented ||
        hasModifier(event) ||
        ownsKeystrokes(event.target)
      ) {
        return
      }
      const target =
        event.key === PREVIOUS_KEY ? prev : event.key === NEXT_KEY ? next : null
      if (target === null) return
      event.preventDefault()
      void router.navigate({ ...options(target), replace: true })
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [router, orgSlug, slug, search, prev, next])

  if (!Result.isSuccess(result)) return null
  if (neighbors === null) return fallback
  const step = (step: Step) => (
    <StepButton {...step} orgSlug={orgSlug} slug={slug} search={search} />
  )
  return (
    <div className="flex items-center gap-0.5">
      <span className="pr-1.5 font-mono text-caption whitespace-nowrap text-muted-foreground tabular-nums">
        {position(neighbors.position, neighbors.total)}
      </span>
      {step({
        neighbor: prev,
        shortcut: PREVIOUS_KEY,
        icon: ChevronUp,
        label: m.tickets_stepper_previous()
      })}
      {step({
        neighbor: next,
        shortcut: NEXT_KEY,
        icon: ChevronDown,
        label: m.tickets_stepper_next()
      })}
    </div>
  )
}

function StepButton({
  neighbor,
  shortcut,
  icon: Icon,
  label,
  orgSlug,
  slug,
  search
}: Step &
  Readonly<{
    orgSlug: string
    slug: string
    search: TicketDetailSearch
  }>) {
  const icon = <Icon strokeWidth={1.75} />
  if (neighbor === null) {
    return (
      <Button variant="ghost" size="icon-sm" aria-label={label} disabled>
        {icon}
      </Button>
    )
  }
  return (
    <TicketPreviewTrigger
      preview={{ kind: "ticket", id: neighbor.id, shortcut }}
      render={
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={label}
          aria-keyshortcuts={shortcut}
          render={
            <Link
              to="/orgs/$orgSlug/projects/$slug/tickets/$id"
              params={{ orgSlug, slug, id: neighbor.id }}
              search={search}
              replace
              preload="intent"
            />
          }
        />
      }
    >
      {icon}
    </TicketPreviewTrigger>
  )
}
