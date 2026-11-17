import { type GroupId, Ticket, type TicketId } from "@pp/shared"
import * as Atom from "effect/reactivity/Atom"
import * as Schema from "effect/Schema"

import { persisted } from "@/api/bootCache"
import { projectScope } from "@/api/keys"
import { bindRowMutation } from "@/api/viewMutation"
import { localSprintBoard } from "@/features/local/atoms/localViews"
import { localValue } from "@/features/local/atoms/readLocal"
import { localTicketUpdate } from "@/features/tickets/atoms/ticketRows"

import { firstScreenCards } from "../lib/boardUtils"

export type BoardRequest = Readonly<{
  _view: "sprintBoard"
  params: Readonly<{
    orgSlug: string
    slug: string
    id: GroupId
  }>
}>

export const boardRequest = (
  orgSlug: string,
  slug: string,
  id: GroupId
): BoardRequest => ({ _view: "sprintBoard", params: { orgSlug, slug, id } })

const scopeOf = (req: BoardRequest) =>
  projectScope(req.params.orgSlug, req.params.slug)

export const BoardValue = Schema.Struct({
  tickets: Schema.Array(Ticket),
  completedAt: Schema.NullOr(Schema.DateFromString)
})
export type BoardValue = typeof BoardValue.Type

const boardView = (req: BoardRequest) =>
  Atom.make((get) => localValue(get(localSprintBoard(req)))).pipe(
    persisted(
      `board/${scopeOf(req)}/${req.params.id}`,
      BoardValue,
      (value) => ({
        ...value,
        tickets: firstScreenCards(value.tickets)
      })
    )
  )

export const sprintBoard = Atom.family(boardView)

export const updateBoardTicket = Atom.family(
  ({ req, id }: Readonly<{ req: BoardRequest; id: TicketId }>) =>
    localTicketUpdate({ ...req.params, id })
)

export const boardTicketUpdates = bindRowMutation(updateBoardTicket)
