import { useAtomValue } from "@effect/atom-react"
import { PinTarget, type TicketDetail } from "@pp/shared"
import { SidebarNote, SidebarRowGroup, SidebarSection } from "@pp/ui/sidebar"
import * as Result from "effect/reactivity/AsyncResult"
import * as Atom from "effect/reactivity/Atom"
import { useState } from "react"

import { pinItem, pinsFor, pinsRequest } from "@/features/pins/atoms/pins"
import { predictionOf } from "@/features/pins/components/PinRow"
import {
  PinTree,
  topPins,
  type PinRowSpec
} from "@/features/pins/components/PinTree"
import { usePinReorder } from "@/features/pins/hooks/usePinReorder"
import {
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
  viewing: PinTarget | null
) {
  const ticket = useAtomValue(
    viewing !== null && PinTarget.isAnyOf(["ticket"])(viewing)
      ? ticketDetail(ticketRequest(orgSlug, slug, viewing.ref))
      : noTicket
  )
  const sprints = useAtomValue(sprintList(sprintListRequest(orgSlug, slug)))
  if (viewing !== null && PinTarget.isAnyOf(["ticket"])(viewing))
    return Result.isSuccess(ticket)
      ? ({
          ticket: {
            id: ticket.value.id,
            title: ticket.value.title,
            status: ticket.value.status,
            archivedAt: ticket.value.archivedAt,
            parent: ticket.value.parent?.id ?? null
          }
        } satisfies PinPrediction)
      : null
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
  const prediction = useLivePrediction(orgSlug, slug, viewing)
  const live =
    showsLiveRow(viewing, activeSprintId, viewingPinned) && prediction !== null
      ? {
          target: viewing,
          display: prediction,
          key: pinKey({ projectSlug: slug, ...viewing })
        }
      : null
  const viewedKey = viewed === null ? null : pinKey(viewed)
  const [landed, setLanded] = useState<
    Readonly<{ key: string | null; on: string | null }>
  >({ key: null, on: viewedKey })
  if (landed.on !== viewedKey) setLanded({ key: null, on: viewedKey })
  const failure = mutationErrorText(pinState)
  const reorder = usePinReorder(orgSlug, slug)

  // The live row first, then the pins; sub-tickets nest under their
  // parent's row when it's here too, pinned or live.
  const rows: ReadonlyArray<PinRowSpec> = [
    ...(live === null || viewedKey === null
      ? []
      : [
          {
            key: viewedKey,
            target: live.target,
            display: live.display,
            pin: null,
            active: false,
            onPinned: () => setLanded({ key: viewedKey, on: viewedKey })
          }
        ]),
    ...pins.map((pin) => ({
      key: pinKey(pin),
      target: pin,
      display: predictionOf(pin),
      pin,
      active: viewed !== null && samePin(pin, viewed),
      highlight: landed.key === pinKey(pin)
    }))
  ]
  const tree = nestPins(rows, (row) => ticketLinkOf(row.display))

  return (
    <SidebarSection label={m.chrome_sidebar_pinned()} count={pins.length}>
      <SidebarRowGroup
        onReorder={(order) => reorder(topPins(tree), order)}
        isSortable={(key) => key !== live?.key}
      >
        {tree.map((node) => (
          <PinTree
            key={node.row.key}
            orgSlug={orgSlug}
            slug={slug}
            node={node}
          />
        ))}
      </SidebarRowGroup>
      {failure === null ? null : (
        <SidebarNote className="text-destructive">{failure}</SidebarNote>
      )}
      {Result.isSuccess(result) && pins.length === 0 && live === null ? (
        <SidebarNote>{m.chrome_sidebar_pinned_empty()}</SidebarNote>
      ) : null}
    </SidebarSection>
  )
}
