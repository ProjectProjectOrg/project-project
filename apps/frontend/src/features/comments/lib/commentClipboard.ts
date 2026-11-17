import type { Comment, CommentAuthor, TicketId } from "@pp/shared"

import type { TicketLocation } from "@/features/tickets/lib/ticketClipboard"

export const commentAuthorName = (author: CommentAuthor): string =>
  author.kind === "user"
    ? (author.user.name ?? author.user.email)
    : author.displayName

export const commentPath = (
  { orgSlug, slug }: TicketLocation,
  ticketId: TicketId,
  commentId: Comment["id"]
): string =>
  `/orgs/${orgSlug}/projects/${slug}/tickets/${ticketId}#${commentId}`

export const commentUrl = (
  location: TicketLocation,
  ticketId: TicketId,
  commentId: Comment["id"]
): string =>
  `${window.location.origin}${commentPath(location, ticketId, commentId)}`

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
    first.body.trim(),
    ...replies.flatMap((reply) => [
      `**${commentAuthorName(reply.author)}**`,
      reply.body.trim()
    ])
  ].join("\n\n")
