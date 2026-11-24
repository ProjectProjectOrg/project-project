import { useAtomValue } from "@effect/atom-react"
import { PinTarget, type TicketDetail } from "@pp/shared"
import { transitions } from "@pp/ui/lib/springs"
import { SidebarNote, SidebarRowGroup, SidebarSection } from "@pp/ui/sidebar"
import * as Result from "effect/reactivity/AsyncResult"
import * as Atom from "effect/reactivity/Atom"
import { AnimatePresence, m as motion, useReducedMotion } from "motion/react"
import { useState, type ReactNode } from "react"

import { pinItem, pinsFor, pinsRequest } from "@/features/pins/atoms/pins"
import { PinTree } from "@/features/pins/components/PinTree"
import { usePinReorder } from "@/features/pins/hooks/usePinReorder"
import {
  predictionOf,
  topPins,
  type PinRowSpec,
  nestPins,
  pinKey,
  pinsIn,
  samePin,
  showsLiveRow,
  ticketLinkOf,
  type PinPrediction
} from "@/features/pins/lib/pins"
import {
  sprintList,
  sprintListRequest
} from "@/features/sprints/atoms/sprintList"
import {
  ticketDetail,
  ticketRequest
} from "@/features/tickets/atoms/ticketDetail"
import { mutationErrorText } from "@/lib/mutationError"
import { m } from "@/paraglide/messages"

const noTicket: Atom.Atom<Result.AsyncResult<TicketDetail, unknown>> =
  Atom.make(Result.initial())

function useLivePrediction(
  orgSlug: string,
  slug: string,
  viewing: PinTarget | null,
  shown: boolean
) {
  const viewingTicket =
    viewing !== null && PinTarget.isAnyOf(["ticket"])(viewing)
  const ticket = useAtomValue(
    viewingTicket
      ? ticketDetail(ticketRequest(orgSlug, slug, viewing.ref))
      : noTicket
  )
  const sprints = useAtomValue(sprintList(sprintListRequest(orgSlug, slug)))
  const current = usePendingTicket(ticket, shown && viewingTicket)
  if (viewingTicket)
    return current === null
      ? null
      : ({
          ticket: {
            id: current.id,
            title: current.title,
            status: current.status,
            archivedAt: current.archivedAt,
            parent: current.parent?.id ?? null
          }
        } satisfies PinPrediction)
  if (
    viewing !== null &&
    PinTarget.isAnyOf(["sprint"])(viewing) &&
    Result.isSuccess(sprints)
  ) {
    const sprint = sprints.value.find((each) => each.id === viewing.ref)
    return sprint === undefined
      ? null
      : ({
          sprint: {
            id: sprint.id,
            name: sprint.name,
            startsAt: sprint.startsAt,
            endsAt: sprint.endsAt,
            completedAt: sprint.completedAt
          }
        } satisfies PinPrediction)
  }
  return null
}

// The live row's key, whatever is viewed: moving between tickets swaps the
// row's content in place instead of one row shrinking out as another grows.
const LIVE_KEY = "live"
// The head of the list holds the live row or, with nothing pinned, the empty
// note. One slot for both, so they fade into each other in place rather than
// stacking while one grows and the other shrinks.
const HEAD_KEY = "head"

function HeadSlot({
  showing,
  children
}: Readonly<{ showing: "live" | "empty"; children: ReactNode }>) {
  const reduce = useReducedMotion() ?? false
  return (
    <div className="relative">
      <AnimatePresence initial={false} mode="popLayout">
        <motion.div
          key={showing}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: reduce ? 0 : 0.1 } }}
          transition={reduce ? { duration: 0 } : transitions.fade}
        >
          {children}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

export function ProjectPins({
  orgSlug,
  slug,
  viewing,
  activeSprintId
}: Readonly<{
  orgSlug: string
  slug: string
  viewing: PinTarget | null
  activeSprintId: string | null
}>) {
  const req = pinsRequest(orgSlug)
  const result = useAtomValue(pinsFor(req))
  const pinState = useAtomValue(pinItem({ req, slug }))
  const pins = Result.isSuccess(result) ? pinsIn(result.value, slug) : []
  const viewed = viewing === null ? null : { projectSlug: slug, ...viewing }
  const viewingPinned =
    viewed !== null && pins.some((pin) => samePin(pin, viewed))
  const shown = showsLiveRow(viewing, activeSprintId, viewingPinned)
  const prediction = useLivePrediction(orgSlug, slug, viewing, shown)
  const live =
    shown && prediction !== null
      ? { target: viewing, display: prediction }
      : null
  const viewedKey = viewed === null ? null : pinKey(viewed)
  const { landedKey, land } = useLandedPin(viewedKey)
  const failure = mutationErrorText(pinState)
  const reorder = usePinReorder(orgSlug, slug)

  // The live row first, then the pins; sub-tickets nest under their
  // parent's row when it's here too, pinned or live.
  const rows: ReadonlyArray<PinRowSpec> = [
    ...(live === null || viewedKey === null
      ? []
      : [
          {
            key: LIVE_KEY,
            target: live.target,
            display: live.display,
            pin: null,
            active: false,
            onPinned: land
          }
        ]),
    ...pins.map((pin) => ({
      key: pinKey(pin),
      target: pin,
      display: predictionOf(pin),
      pin,
      active: viewed !== null && samePin(pin, viewed),
      highlight: landedKey === pinKey(pin)
    }))
  ]
  const tree = nestPins(rows, (row) => ticketLinkOf(row.display))
  const empty = Result.isSuccess(result) && pins.length === 0 && live === null
  return (
    <SidebarSection label={m.chrome_sidebar_pinned()} count={pins.length}>
      <PinnedRows
        tree={tree}
        orgSlug={orgSlug}
        slug={slug}
        empty={empty}
        onReorder={(order) => reorder(topPins(tree), order)}
      />
      {failure === null ? null : (
        <SidebarNote tone="error">{failure}</SidebarNote>
      )}
    </SidebarSection>
  )
}

function usePendingTicket(
  ticket: Result.AsyncResult<TicketDetail, unknown>,
  showTicket: boolean
) {
  // While the next ticket loads, the live row keeps showing the last one, so
  // it changes in place instead of shrinking out and growing back in.
  const [held, setHeld] = useState<TicketDetail | null>(null)
  const loaded = Result.isSuccess(ticket) ? ticket.value : null
  const current = showTicket
    ? (loaded ?? (Result.isInitial(ticket) ? held : null))
    : null
  if (current !== held) setHeld(current)
  return current
}

function useLandedPin(viewedKey: string | null) {
  const [landed, setLanded] = useState<
    Readonly<{ key: string | null; on: string | null }>
  >({ key: null, on: viewedKey })
  if (landed.on !== viewedKey) setLanded({ key: null, on: viewedKey })
  return {
    landedKey: landed.key,
    land: () => setLanded({ key: viewedKey, on: viewedKey })
  }
}

function PinnedRows({
  tree,
  orgSlug,
  slug,
  empty,
  onReorder
}: Readonly<{
  tree: ReturnType<typeof nestPins<PinRowSpec>>
  orgSlug: string
  slug: string
  empty: boolean
  onReorder: (order: ReadonlyArray<string>) => void
}>) {
  const liveNode = tree.find((node) => node.row.key === LIVE_KEY)
  const pinTree = (node: (typeof tree)[number]) => (
    <PinTree key={node.row.key} orgSlug={orgSlug} slug={slug} node={node} />
  )

  return (
    <SidebarRowGroup
      onReorder={onReorder}
      isSortable={(key) => key !== HEAD_KEY}
    >
      {liveNode === undefined && !empty ? null : (
        <HeadSlot key={HEAD_KEY} showing={empty ? "empty" : "live"}>
          {liveNode === undefined ? (
            <SidebarNote>{m.chrome_sidebar_pinned_empty()}</SidebarNote>
          ) : (
            pinTree(liveNode)
          )}
        </HeadSlot>
      )}
      {tree.filter((node) => node !== liveNode).map(pinTree)}
    </SidebarRowGroup>
  )
}
