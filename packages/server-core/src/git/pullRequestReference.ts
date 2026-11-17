import type { TicketId } from "@pp/shared"
import { closingTicketIdsInText, ticketIdsInText } from "@pp/shared"
import * as Arr from "effect/Array"
import { pipe } from "effect/Function"
import * as Option from "effect/Option"

export type PullRequestTicketSource = "branch" | "title" | "body"

export type PullRequestText = Readonly<{
  branch: string
  title: string
  body: string
}>

export type PullRequestTicketReference = Readonly<{
  source: PullRequestTicketSource
  ticketIds: ReadonlySet<TicketId>
}>

export type PullRequestTicketPick = Readonly<{
  source: PullRequestTicketSource
  ticketId: TicketId
}>

export type ResolveTicketId = (id: TicketId) => TicketId

const resolveAll = (
  ids: ReadonlySet<TicketId>,
  resolveId: ResolveTicketId
): ReadonlySet<TicketId> => new Set([...ids].map(resolveId))

export const pullRequestTicketReferences = (
  pr: PullRequestText,
  resolveId: ResolveTicketId
): ReadonlyArray<PullRequestTicketReference> => [
  {
    source: "branch",
    ticketIds: resolveAll(ticketIdsInText(pr.branch), resolveId)
  },
  {
    source: "title",
    ticketIds: resolveAll(ticketIdsInText(pr.title), resolveId)
  },
  {
    source: "body",
    ticketIds: resolveAll(closingTicketIdsInText(pr.body), resolveId)
  }
]

export const pickPullRequestTicket = (
  references: ReadonlyArray<PullRequestTicketReference>,
  existing: ReadonlySet<string>
): Option.Option<PullRequestTicketPick> =>
  pipe(
    references,
    Arr.map(({ source, ticketIds }) => ({
      source,
      ticketIds: Arr.filter([...ticketIds], (id) => existing.has(id))
    })),
    Arr.findFirst(({ ticketIds }) => ticketIds.length > 0),
    Option.filter(({ ticketIds }) => ticketIds.length === 1),
    Option.flatMap(({ source, ticketIds }) =>
      Option.map(Arr.head(ticketIds), (ticketId) => ({ source, ticketId }))
    )
  )
