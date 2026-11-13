import { useAtomValue } from "@effect/atom-react"
import {
  isEpic,
  type TicketDetail,
  type TicketNeighbor,
  type TicketNeighbors,
  type TicketViewSource
} from "@pp/shared"
import { Link, useRouter } from "@tanstack/react-router"
import * as Result from "effect/reactivity/AsyncResult"
import { ChevronDown, ChevronUp } from "lucide-react"
import { useEffect, useMemo } from "react"

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

type Shown = Readonly<{
  ticketId: TicketDetail["id"]
  neighbors: TicketNeighbors
  position: (position: number, total: number) => string
  search: TicketDetailSearch
}>

let lastShown: Shown | null = null

export function TicketStepper({
  ticket,
  from
}: Readonly<{
  ticket: Pick<TicketDetail, "id" | "parent">
  from: TicketPageSource | undefined
}>) {
  const { orgSlug, slug } = useProjectRoute()
  const source = from === undefined || from.kind === "parent" ? SIBLINGS : from
  const sourceResult = useAtomValue(
    ticketNeighbors(ticketNeighborsRequest(orgSlug, slug, ticket.id, source))
  )
  const siblingResult = useAtomValue(
    ticketNeighbors(ticketNeighborsRequest(orgSlug, slug, ticket.id, SIBLINGS))
  )

  const view = useMemo((): Shown | null | "loading" => {
    const parent = ticket.parent
    const siblings = (): Shown | null | "loading" => {
      if (parent === null) return null
      if (!Result.isSuccess(siblingResult)) return "loading"
      if (siblingResult.value === null) return null
      return {
        ticketId: ticket.id,
        neighbors: siblingResult.value,
        search:
          from?.kind === "parent"
            ? { from: "parent", parentId: from.parent }
            : NO_SEARCH,
        position: (position, total) =>
          isEpic(parent)
            ? m.tickets_stepper_epic_position({ position, total })
            : m.tickets_stepper_sub_ticket_position({ position, total })
      }
    }
    if (source.kind === "siblings") return siblings()
    if (!Result.isSuccess(sourceResult)) return "loading"
    if (sourceResult.value === null) return siblings()
    return {
      ticketId: ticket.id,
      neighbors: sourceResult.value,
      search: ticketSearchFromSource(source),
      position: (position, total) =>
        m.tickets_stepper_position({ position, total })
    }
  }, [ticket, from, source, sourceResult, siblingResult])

  useEffect(() => {
    if (view !== "loading") lastShown = view
  }, [view])

  const shown = view === "loading" ? predict(lastShown, ticket.id) : view
  if (shown === null) return null
  return <Stepper shown={shown} orgSlug={orgSlug} slug={slug} />
}

function predict(last: Shown | null, ticketId: Shown["ticketId"]) {
  if (last === null) return null
  const { prev, next, position, total } = last.neighbors
  const step = next?.id === ticketId ? 1 : prev?.id === ticketId ? -1 : 0
  if (step === 0) return null
  return {
    ...last,
    ticketId,
    neighbors: { prev: null, next: null, position: position + step, total }
  } satisfies Shown
}

function Stepper({
  shown: { neighbors, position, search },
  orgSlug,
  slug
}: Readonly<{ shown: Shown; orgSlug: string; slug: string }>) {
  const router = useRouter()
  const { prev, next } = neighbors

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
