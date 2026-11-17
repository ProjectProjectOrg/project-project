import { rewriteTicketMentions, type Comment, type TicketId } from "@pp/shared"

import { m } from "@/paraglide/messages"

import { commentAuthorName } from "./commentClipboard"

const TITLE_LENGTH = 80

const titleFrom = (body: string): string => {
  const line =
    body
      .split("\n")
      .map((text) => text.replace(/^\s*(?:#+|>|[-*+]|\d+\.)\s+/u, "").trim())
      .find((text) => text !== "") ?? ""
  return line.length <= TITLE_LENGTH
    ? line
    : `${line.slice(0, TITLE_LENGTH - 1).trimEnd()}…`
}

export const ticketFromComment = (
  comment: Pick<Comment, "author" | "body">,
  projectSlug: string,
  ticketId: TicketId,
  url: string
) => ({
  title: titleFrom(comment.body),
  body: [
    m.comments_ticket_source({
      author: `**${commentAuthorName(comment.author)}**`,
      source: `[${m.comments_ticket_source_link({ ticket: ticketId })}](${url})`
    }),
    rewriteTicketMentions(comment.body.trim(), (target) =>
      target.projectSlug === null ? { ...target, projectSlug } : null
    )
      .split("\n")
      .map((line) => (line === "" ? ">" : `> ${line}`))
      .join("\n")
  ].join("\n\n")
})
