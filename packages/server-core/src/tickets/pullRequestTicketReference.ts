import type { TicketId } from "@pp/shared"
import * as Arr from "effect/Array"
import { pipe } from "effect/Function"
import * as Option from "effect/Option"

import { closingTicketIdsInText, ticketIdsInText } from "./branchTicketId"

export type PullRequestTicketSource = "branch" | "title" | "body"

export interface PullRequestText {
  readonly branch: string
  readonly title: string
  readonly body: string
}

export interface PullRequestTicketReference {
  readonly source: PullRequestTicketSource
  readonly ticketIds: ReadonlySet<TicketId>
}

export interface PullRequestTicketPick {
  readonly source: PullRequestTicketSource
  readonly ticketId: TicketId
}

export const pullRequestTicketReferences = (
  pr: PullRequestText
): ReadonlyArray<PullRequestTicketReference> => [
  { source: "branch", ticketIds: ticketIdsInText(pr.branch) },
  { source: "title", ticketIds: ticketIdsInText(pr.title) },
  { source: "body", ticketIds: closingTicketIdsInText(pr.body) }
]

/**
 * The first source naming a ticket the project has decides. When that source
 * names more than one, the pull request is ambiguous and links nothing.
 */
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
