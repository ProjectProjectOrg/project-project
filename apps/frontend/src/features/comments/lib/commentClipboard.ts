import type { Comment, CommentAuthor, TicketId } from "@pp/shared"

import {
  ticketUrl,
  type TicketLocation
} from "@/features/tickets/lib/ticketClipboard"

export const commentAuthorName = (author: CommentAuthor): string =>
  author.kind === "user"
    ? (author.user.name ?? author.user.email)
    : author.displayName

export const commentUrl = (
  location: TicketLocation,
  ticketId: TicketId,
  commentId: Comment["id"]
): string => `${ticketUrl(location, ticketId)}#${commentId}`

const markdownBody = (body: string): string =>
  body.replace(/^(?:[ \t]*\n)+/u, "").trimEnd()

export const commentMarkdown = (
  [first, ...replies]: readonly [
    Pick<Comment, "author" | "body">,
    ...ReadonlyArray<Pick<Comment, "author" | "body">>
  ],
  ticketId: TicketId,
  url: string
): string =>
  [
    `**${commentAuthorName(first.author)}** · [${ticketId}](${url})`,
    markdownBody(first.body),
    ...replies.flatMap((reply) => [
      `**${commentAuthorName(reply.author)}**`,
      markdownBody(reply.body)
    ])
  ].join("\n\n")
