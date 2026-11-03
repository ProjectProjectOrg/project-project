import type { Comment, Ticket } from "@pp/shared"

export const commenterIds = (
  comments: ReadonlyArray<Pick<Comment, "author">>
): ReadonlyArray<string> =>
  comments
    .toReversed()
    .flatMap((comment) =>
      comment.author.kind === "user" ? [comment.author.user.id] : []
    )

export const ticketParticipants = (
  ticket: Pick<Ticket, "assignees" | "createdBy"> | null,
  commenters: ReadonlyArray<string>
): ReadonlyArray<string> => [
  ...new Set(
    ticket ? [...ticket.assignees, ticket.createdBy, ...commenters] : commenters
  )
]
