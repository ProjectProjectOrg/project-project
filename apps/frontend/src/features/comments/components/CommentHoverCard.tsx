import { useAtomValue } from "@effect/atom-react"
import { stripMentionLinks, type Comment, type TicketId } from "@pp/shared"
import { MemberAvatar } from "@pp/ui/member-avatar"
import { PopoverContent } from "@pp/ui/popover"
import * as Result from "effect/reactivity/AsyncResult"

import { comments, commentsRequest } from "@/features/comments/atoms/comments"
import { commentAuthorName } from "@/features/comments/lib/commentClipboard"
import { TicketPreviewBody } from "@/features/tickets/components/TicketHoverCard"
import { TimelineTime } from "@/features/tickets/components/TimelineTime"
import { m } from "@/paraglide/messages"

type Scope = Readonly<{ orgSlug: string; slug: string }>

type PreviewProps = Readonly<{
  ticketId: TicketId
  commentId: string
  scope: Scope
}>

export function CommentHoverCard(props: PreviewProps) {
  return (
    <PopoverContent className="w-80" align="start">
      <CommentPreviewBody {...props} />
    </PopoverContent>
  )
}

function CommentPreviewBody({ ticketId, commentId, scope }: PreviewProps) {
  const result = useAtomValue(
    comments(commentsRequest(scope.orgSlug, scope.slug, ticketId))
  )
  const ticketPreview = (
    <TicketPreviewBody ticketId={ticketId} scope={scope} interactive />
  )
  return Result.match(result, {
    onInitial: () => null,
    onFailure: () => ticketPreview,
    onSuccess: ({ value }) => {
      const comment = value.find((row) => row.comment.id === commentId)
      return comment === undefined ? (
        ticketPreview
      ) : (
        <CommentPreview comment={comment.comment} />
      )
    }
  })
}

function CommentPreview({ comment }: Readonly<{ comment: Comment }>) {
  return (
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
  )
}
