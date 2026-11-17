import { useAtomValue } from "@effect/atom-react"
import { stripMentionLinks, type TicketId } from "@pp/shared"
import * as Result from "effect/reactivity/AsyncResult"

import { PopoverContent } from "@/components/ui/popover"
import { comments, commentsRequest } from "@/features/comments/atoms/comments"
import { commentAuthorName } from "@/features/comments/lib/commentClipboard"
import { MemberAvatar } from "@/features/members/components/MemberAvatar"
import { TicketPreviewBody } from "@/features/tickets/components/TicketHoverCard"
import { TimelineTime } from "@/features/tickets/components/TimelineTime"
import { m } from "@/paraglide/messages"

type Scope = Readonly<{ orgSlug: string; slug: string }>

export function CommentHoverCard({
  ticketId,
  commentId,
  scope
}: Readonly<{ ticketId: TicketId; commentId: string; scope: Scope }>) {
  const result = useAtomValue(
    comments(commentsRequest(scope.orgSlug, scope.slug, ticketId))
  )
  const comment = Result.isSuccess(result)
    ? (result.value.find((row) => row.comment.id === commentId)?.comment ??
      null)
    : undefined
  return (
    <PopoverContent className="w-80" align="start">
      {comment === null ? (
        <TicketPreviewBody ticketId={ticketId} scope={scope} interactive />
      ) : comment === undefined ? null : (
        <div className="flex flex-col gap-1.5 text-body">
          <div className="flex min-w-0 items-center gap-2">
            {comment.author.kind === "user" && (
              <MemberAvatar member={comment.author.user} size={20} />
            )}
            <span className="truncate">
              {m.comments_mention_card_from({
                name: commentAuthorName(comment.author)
              })}
            </span>
            <TimelineTime at={comment.createdAt} className="shrink-0" />
          </div>
          <p className="line-clamp-4 whitespace-pre-line text-muted-foreground">
            {stripMentionLinks(comment.body)}
          </p>
        </div>
      )}
    </PopoverContent>
  )
}
