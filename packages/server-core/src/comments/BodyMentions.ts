import {
  extractMentionLinks,
  mentionedTicket,
  MentionInvalid
} from "@pp/shared"
import * as Effect from "effect/Effect"

export const validateBodyMentions = (
  body: string,
  memberIds: ReadonlySet<string>,
  ticketIds: ReadonlySet<string>,
  tolerated: ReadonlySet<string> = new Set()
): Effect.Effect<void, MentionInvalid> =>
  Effect.gen(function* () {
    const links = extractMentionLinks(body).filter(
      (link) => !tolerated.has(link.href)
    )
    for (const link of links) {
      if (!link.parsed) {
        return yield* new MentionInvalid({
          kind: "malformed_href",
          href: link.href
        })
      }
      if (link.label.trim() === "") {
        return yield* new MentionInvalid({
          kind: "empty_label",
          href: link.href
        })
      }
      if (link.parsed.type === "user" && !memberIds.has(link.parsed.id)) {
        return yield* new MentionInvalid({
          kind: "unknown_user",
          href: link.href
        })
      }
      const ticket = mentionedTicket(link.parsed)
      if (link.parsed.type === "comment" && ticket === null) {
        return yield* new MentionInvalid({
          kind: "malformed_href",
          href: link.href
        })
      }
      if (ticket !== null && !ticketIds.has(ticket)) {
        return yield* new MentionInvalid({
          kind: "unknown_ticket",
          href: link.href
        })
      }
    }
  })

export const validateBodyMentionsWithLookups = <
  TicketError,
  MemberError,
  TicketContext,
  MemberContext
>(
  body: string,
  lookups: {
    readonly existingTicketIds: (
      ticketIds: ReadonlyArray<string>
    ) => Effect.Effect<ReadonlySet<string>, TicketError, TicketContext>
    readonly memberIds: () => Effect.Effect<
      ReadonlySet<string>,
      MemberError,
      MemberContext
    >
  },
  previousBody = ""
): Effect.Effect<
  void,
  MentionInvalid | TicketError | MemberError,
  TicketContext | MemberContext
> => {
  if (!body.includes("](mention:")) return Effect.void
  return Effect.gen(function* () {
    const links = extractMentionLinks(body)
    const referencedTicketIds = [
      ...new Set(
        links.flatMap((link) => {
          const ticket = link.parsed ? mentionedTicket(link.parsed) : null
          return ticket === null ? [] : [ticket]
        })
      )
    ]
    const hasUserMentions = links.some((link) => link.parsed?.type === "user")
    const [ticketIds, memberIds] = yield* Effect.all(
      [
        lookups.existingTicketIds(referencedTicketIds),
        hasUserMentions
          ? lookups.memberIds()
          : Effect.succeed<ReadonlySet<string>>(new Set<string>())
      ],
      { concurrency: 2 }
    )
    const tolerated = new Set(
      extractMentionLinks(previousBody).map((link) => link.href)
    )
    yield* validateBodyMentions(body, memberIds, ticketIds, tolerated)
  })
}
