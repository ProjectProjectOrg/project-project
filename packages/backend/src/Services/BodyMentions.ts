import * as Effect from "effect/Effect"
import { extractMentionLinks, MentionInvalid } from "@projectproject/shared"

export const validateBodyMentions = (
  body: string,
  memberIds: ReadonlySet<string>,
  ticketIds: ReadonlySet<string>
): Effect.Effect<void, MentionInvalid> =>
  Effect.gen(function* () {
    const links = extractMentionLinks(body)
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
      if (link.parsed.type === "ticket" && !ticketIds.has(link.parsed.id)) {
        return yield* new MentionInvalid({
          kind: "unknown_ticket",
          href: link.href
        })
      }
    }
  })
