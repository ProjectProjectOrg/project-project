import { useAtomValue } from "@effect/atom-react"
import type { PinTarget, TicketDetail } from "@pp/shared"
import { SidebarNote, SidebarRowGroup, SidebarSection } from "@pp/ui/sidebar"
import * as Result from "effect/reactivity/AsyncResult"
import * as Atom from "effect/reactivity/Atom"
import { useState } from "react"

import { pinItem, pinsFor, pinsRequest } from "@/features/pins/atoms/pins"
import { PinRow, predictionOf } from "@/features/pins/components/PinRow"
import { usePinReorder } from "@/features/pins/hooks/usePinReorder"
import {
  pinKey,
  pinsIn,
  samePin,
  showsLiveRow,
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
): PinPrediction | null {
  const ticket = useAtomValue(
    viewing?.kind === "ticket"
      ? ticketDetail(ticketRequest(orgSlug, slug, viewing.ref))
      : noTicket
  )
  const sprints = useAtomValue(sprintList(sprintListRequest(orgSlug, slug)))
  if (viewing?.kind === "ticket")
    return Result.isSuccess(ticket)
      ? {
          ticket: {
            id: ticket.value.id,
            title: ticket.value.title,
            status: ticket.value.status,
            archivedAt: ticket.value.archivedAt
          }
        }
      : null
  if (viewing?.kind === "sprint" && Result.isSuccess(sprints)) {
    const sprint = sprints.value.find((each) => each.id === viewing.ref)
    return sprint === undefined
      ? null
      : {
          sprint: {
            id: sprint.id,
            name: sprint.name,
            startsAt: sprint.startsAt,
            endsAt: sprint.endsAt,
            completedAt: sprint.completedAt
          }
        }
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

  return (
    <SidebarSection label={m.chrome_sidebar_pinned()} count={pins.length}>
      <SidebarRowGroup
        onReorder={(order) => reorder(pins, order)}
        isSortable={(key) => key !== live?.key}
      >
        {[
          ...(live === null || viewedKey === null
            ? []
            : [
                <PinRow
                  key={viewedKey}
                  orgSlug={orgSlug}
                  slug={slug}
                  target={live.target}
                  display={live.display}
                  pinned={false}
                  active={false}
                  onPinned={() => setLanded({ key: viewedKey, on: viewedKey })}
                />
              ]),
          ...pins.map((pin) => (
            <PinRow
              key={pinKey(pin)}
              orgSlug={orgSlug}
              slug={slug}
              target={pin}
              display={predictionOf(pin)}
              pinned
              active={viewed !== null && samePin(pin, viewed)}
              highlight={landed.key === pinKey(pin)}
            />
          ))
        ]}
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
