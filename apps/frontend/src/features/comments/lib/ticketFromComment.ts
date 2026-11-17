import { formatMentionHref, type Comment, type TicketId } from "@pp/shared"

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
  comment: Pick<Comment, "id" | "author" | "body">,
  ticketId: TicketId
) => ({
  title: titleFrom(comment.body),
  body: [
    `**${commentAuthorName(comment.author)}** said in [${ticketId}](${formatMentionHref("comment", `${ticketId}/${comment.id}`)}):`,
    comment.body
      .trim()
      .split("\n")
      .map((line) => (line === "" ? ">" : `> ${line}`))
      .join("\n")
  ].join("\n\n")
})
