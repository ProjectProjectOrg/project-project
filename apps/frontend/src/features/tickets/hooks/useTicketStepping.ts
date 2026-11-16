import { RegistryContext, useAtomValue } from "@effect/atom-react"
import type { GroupId, TicketId, TicketSequence } from "@pp/shared"
import { useHotkey } from "@tanstack/react-hotkeys"
import { useRouter } from "@tanstack/react-router"
import * as Result from "effect/reactivity/AsyncResult"
import { use, useEffect, useLayoutEffect, useRef, useState } from "react"

import { useProjectRoute } from "@/features/projects/hooks/useProject"
import { steppedTicket } from "@/features/tickets/atoms/steppedTicket"
import {
  ticketDetail,
  ticketRequest
} from "@/features/tickets/atoms/ticketDetail"
import {
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
  STEP_SETTLE_MS,
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
}>

export type TicketStepping = Readonly<{
  shown: TicketId
  settled: boolean
  sequence: TicketSequence | null
  search: TicketDetailSearch
}>

export function useTicketStepping(
  urlId: TicketId,
  from: TicketPageSource | undefined,
  sprint: GroupId | undefined
): TicketStepping {
  const { orgSlug, slug } = useProjectRoute()
  const router = useRouter()
  const registry = use(RegistryContext)
  const listSource = from?.kind === "parent" ? undefined : from
  const search = ticketPageSearch(from, sprint)

  const source = JSON.stringify([orgSlug, slug, from ?? null])
  const [entry, setEntry] = useState<Entry>({ id: urlId, source })
  if (entry.source !== source) setEntry({ id: urlId, source })
  const loaded = useAtomValue(
    ticketSequence(ticketSequenceRequest(orgSlug, slug, entry.id, listSource))
  )
  const [session, setSession] = useState<Session | null>(null)
  if (Result.isSuccess(loaded) && session?.entry !== entry) {
    setSession({ entry, sequence: loaded.value })
  }
  const sequence = session?.entry === entry ? session.sequence : null

  const [cursor, setCursor] = useState<StepCursor | null>(null)
  const [stepping, setStepping] = useState(false)
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

  const warmed = useRef(new Map<TicketId, () => void>())
  useEffect(() => {
    const mounts = warmed.current
    return () => {
      for (const unmount of mounts.values()) unmount()
      mounts.clear()
    }
  }, [])

  useEffect(() => {
    if (sequence === null) return
    const mounts = warmed.current
    const warm = new Set(warmWindow(sequence.tickets, shown, direction.current))
    for (const [id, unmount] of mounts) {
      if (warm.has(id)) continue
      unmount()
      mounts.delete(id)
    }
    for (const id of warm) {
      if (mounts.has(id)) continue
      mounts.set(
        id,
        registry.mount(ticketDetail(ticketRequest(orgSlug, slug, id)))
      )
    }
  }, [registry, orgSlug, slug, sequence, shown])

  useEffect(() => {
    const sent: Array<number> = []
    let commitTimer: number | undefined
    let settleTimer: number | undefined

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
      setStepping(true)
      window.clearTimeout(settleTimer)
      settleTimer = window.setTimeout(() => setStepping(false), STEP_SETTLE_MS)
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
      window.clearTimeout(settleTimer)
    }
  }, [router, orgSlug, slug])

  useHotkey(appHotkeys["tickets.next"], (event) =>
    stepper.current?.(1, event.repeat)
  )
  useHotkey(appHotkeys["tickets.previous"], (event) =>
    stepper.current?.(-1, event.repeat)
  )

  return { shown, settled: !stepping, sequence, search }
}
