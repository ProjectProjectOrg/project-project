import { RegistryContext, useAtomValue } from "@effect/atom-react"
import type { GroupId, TicketId, TicketSequence } from "@pp/shared"
import { useHotkey } from "@tanstack/react-hotkeys"
import { useRouter } from "@tanstack/react-router"
import * as Predicate from "effect/Predicate"
import * as Result from "effect/reactivity/AsyncResult"
import { use, useEffect, useLayoutEffect, useRef, useState } from "react"

import { useProjectRoute } from "@/features/projects/hooks/useProject"
import { steppedTicket } from "@/features/tickets/atoms/steppedTicket"
import {
  FILL_AHEAD,
  fillTicketWindow
} from "@/features/tickets/atoms/ticketContentFill"
import {
  knownViewSequence,
  rememberViewSequence,
  ticketSequence,
  ticketSequenceRequest
} from "@/features/tickets/atoms/ticketSequence"
import {
  ticketPageSearch,
  type TicketDetailSearch,
  type TicketPageSource
} from "@/features/tickets/lib/ticketSearch"
import {
  committedCursor,
  settledCursor,
  shownTicket,
  stepCursor,
  stepTarget,
  urlCommitDelay,
  warmWindow,
  type StepCursor,
  type StepDirection
} from "@/features/tickets/lib/ticketStepping"
import { appHotkeys } from "@/lib/appHotkeys"

type Entry = Readonly<{ id: TicketId; source: string }>

type Session = Readonly<{
  entry: Entry
  sequence: TicketSequence | null
  provisional: boolean
}>

export type TicketStepping = Readonly<{
  shown: TicketId
  sequence: TicketSequence | null
  search: TicketDetailSearch
}>

export function useTicketStepping(
  urlId: TicketId,
  from: TicketPageSource | undefined,
  sprint: GroupId | undefined
) {
  const { orgSlug, slug } = useProjectRoute()
  const router = useRouter()
  const registry = use(RegistryContext)
  const listSource = Predicate.isTagged(from, "parent") ? undefined : from
  const search = ticketPageSearch(from, sprint)

  const source = JSON.stringify([orgSlug, slug, from ?? null])
  const [entry, setEntry] = useState<Entry>({ id: urlId, source })
  if (entry.source !== source) setEntry({ id: urlId, source })
  const sequenceReq = ticketSequenceRequest(orgSlug, slug, entry.id, listSource)
  const loaded = useAtomValue(ticketSequence(sequenceReq))
  const [session, setSession] = useState<Session | null>(null)
  if (Result.isSuccess(loaded)) {
    if (session?.entry !== entry || session.provisional)
      setSession({ entry, sequence: loaded.value, provisional: false })
  } else if (session?.entry !== entry) {
    const known = knownViewSequence(registry, sequenceReq)
    if (known !== null)
      setSession({ entry, sequence: known, provisional: true })
  }
  const loadedSequence = Result.isSuccess(loaded) ? loaded.value : undefined
  useEffect(() => {
    if (loadedSequence !== undefined)
      rememberViewSequence(registry, sequenceReq, loadedSequence)
  }, [registry, sequenceReq, loadedSequence])
  const sequence = session?.entry === entry ? session.sequence : null

  const [cursor, setCursor] = useState<StepCursor | null>(null)
  if (cursor !== settledCursor(cursor, urlId)) setCursor(null)
  const shown = shownTicket(cursor, urlId)
  const inSequence = (id: TicketId) =>
    sequence?.tickets.some((ticket) => ticket.id === id) ?? false
  if (session?.entry === entry && entry.id !== urlId && !inSequence(urlId)) {
    setEntry({ id: urlId, source })
  }

  const direction = useRef<StepDirection>(1)
  const stepper = useRef<((to: StepDirection, held: boolean) => void) | null>(
    null
  )
  const latest = useRef({ sequence, shown, urlId, cursor, search })
  useLayoutEffect(() => {
    latest.current = { sequence, shown, urlId, cursor, search }
  })

  const title = sequence?.tickets.find((ticket) => ticket.id === shown)?.title
  useLayoutEffect(() => {
    registry.set(
      steppedTicket,
      title === undefined || shown === urlId
        ? null
        : { urlId, id: shown, title }
    )
  }, [registry, urlId, shown, title])
  useLayoutEffect(() => () => registry.set(steppedTicket, null), [registry])

  useEffect(() => {
    if (sequence === null) return undefined
    return fillTicketWindow(
      registry,
      { orgSlug, slug },
      warmWindow(sequence.tickets, shown, direction.current),
      warmWindow(sequence.tickets, shown, direction.current, FILL_AHEAD)
    )
  }, [registry, orgSlug, slug, sequence, shown])

  useEffect(() => {
    const sent: Array<number> = []
    let commitTimer: number | undefined

    const commit = () => {
      commitTimer = undefined
      const { cursor, urlId, search } = latest.current
      if (cursor === null || cursor.shown === urlId) return
      const committed = committedCursor(cursor)
      latest.current = { ...latest.current, cursor: committed }
      setCursor(committed)
      sent.push(performance.now())
      void router.navigate({
        to: "/orgs/$orgSlug/projects/$slug/tickets/$id",
        params: { orgSlug, slug, id: cursor.shown },
        search,
        replace: true,
        resetScroll: false,
        state: { ticketStep: true }
      })
    }

    stepper.current = (to, held) => {
      const { sequence, shown, urlId, cursor } = latest.current
      if (sequence === null) return
      const target = stepTarget(sequence.tickets, shown, to)
      if (target === null) return
      direction.current = to
      const next = stepCursor(cursor, urlId, target.id)
      latest.current = { ...latest.current, cursor: next, shown: next.shown }
      setCursor(next)
      document.querySelector("[data-scroll-root]")?.scrollTo({ top: 0 })

      const delay = urlCommitDelay(sent, performance.now(), held)
      if (delay === 0) {
        window.clearTimeout(commitTimer)
        commit()
      } else if (commitTimer === undefined) {
        commitTimer = window.setTimeout(commit, delay)
      }
    }

    return () => {
      stepper.current = null
      window.clearTimeout(commitTimer)
    }
  }, [router, orgSlug, slug])

  useHotkey(appHotkeys["tickets.next"], (event) =>
    stepper.current?.(1, event.repeat)
  )
  useHotkey(appHotkeys["tickets.previous"], (event) =>
    stepper.current?.(-1, event.repeat)
  )

  return { shown, sequence, search }
}
