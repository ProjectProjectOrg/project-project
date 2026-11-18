import { RegistryContext } from "@effect/atom-react"
import type { TicketId } from "@pp/shared"
import { Button } from "@pp/ui/button"
import { Comment as CommentBubble, CommentFailed } from "@pp/ui/comment"
import {
  DropdownMenu,
  DropdownMenuConfirmItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@pp/ui/dropdown-menu"
import { LexicalEditor } from "@pp/ui/editor/lexical-editor"
import { Markdown } from "@pp/ui/editor/markdown"
import { Copy, MoreHorizontal, Pencil, Trash2, X } from "@pp/ui/icons"
import { useContext, useState } from "react"

import {
  commentsRequest,
  discardFailedComment,
  retryFailedComment,
  type OutboxEntry
} from "@/features/comments/atoms/comments"
import { useProjectRoute } from "@/features/projects/hooks/useProject"
import { TimelineTime } from "@/features/tickets/components/TimelineTime"
import { describeCause } from "@/lib/errorMessage"
import { m } from "@/paraglide/messages"

import { AuthorMark } from "./CommentRow"

// A comment that failed to send, kept in its place in the thread: a red
// hairline, "Not sent" and Retry under it, and a menu to edit the text (Save
// sends it again), copy it or discard it.
export function FailedCommentRow({
  entry,
  ticketId
}: Readonly<{ entry: OutboxEntry; ticketId: TicketId }>) {
  const { orgSlug, slug } = useProjectRoute()
  const registry = useContext(RegistryContext)
  const req = commentsRequest(orgSlug, slug, ticketId)
  const [editing, setEditing] = useState(false)
  const [body, setBody] = useState(entry.input.body)
  const author = entry.author.name || entry.author.email
  const mark = <AuthorMark author={{ kind: "user", user: entry.author }} />
  const retry = (text?: string) =>
    void retryFailedComment(registry, req, entry, text)

  if (editing)
    return (
      <CommentBubble
        mark={mark}
        author={author}
        meta={<span>{m.comments_editing_marker()}</span>}
        failed
        editActions={
          <>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setBody(entry.input.body)
                setEditing(false)
              }}
            >
              <X className="size-4" strokeWidth={1.75} />
              {m.common_cancel_button()}
            </Button>
            <Button
              size="sm"
              onClick={() => retry(body)}
              disabled={!body.trim()}
            >
              {m.comments_save_button()}
            </Button>
          </>
        }
      >
        <LexicalEditor
          markdown={body}
          // oxlint-disable-next-line jsx-a11y/no-autofocus -- focus follows Edit, as in CommentRow
          onDraftChange={setBody}
          autoFocus
          compact
        />
      </CommentBubble>
    )

  return (
    <CommentBubble
      mark={mark}
      author={author}
      time={<TimelineTime at={entry.createdAt} />}
      failed
      actions={
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="square-7"
                aria-label={m.comments_menu_aria_label()}
                className="opacity-0 transition-opacity group-hover/reveal:opacity-100 group-has-[:focus-visible]/reveal:opacity-100 data-popup-open:opacity-100 pointer-coarse:opacity-100"
              />
            }
          >
            <MoreHorizontal className="size-4" strokeWidth={1.75} />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" sideOffset={6} className="w-52">
            <DropdownMenuItem
              onClick={() => setEditing(true)}
              className="cursor-pointer"
            >
              <Pencil className="size-4" strokeWidth={1.75} />
              {m.comments_edit_button()}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() =>
                void navigator.clipboard.writeText(entry.input.body)
              }
              className="cursor-pointer"
            >
              <Copy className="size-4" strokeWidth={1.75} />
              {m.comments_menu_copy_text()}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuConfirmItem
              icon={<Trash2 className="size-4" strokeWidth={1.75} />}
              label={m.comments_menu_discard()}
              confirmLabel={m.comments_discard_confirm()}
              busyLabel={m.comments_discarding()}
              describeError={describeCause}
              onConfirm={() =>
                discardFailedComment(registry, req, entry.clientId)
              }
            />
          </DropdownMenuContent>
        </DropdownMenu>
      }
      footer={
        <CommentFailed
          message={m.comments_failed_message()}
          retryLabel={m.comments_failed_retry()}
          onRetry={() => retry()}
        />
      }
    >
      <Markdown>{entry.input.body}</Markdown>
    </CommentBubble>
  )
}
