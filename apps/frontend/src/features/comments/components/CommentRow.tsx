import { useAtomValue, useAtomSet } from "@effect/atom-react"
import { CommentPolicy } from "@pp/access/policies"
import type { Comment, TicketId } from "@pp/shared"
import { Button } from "@pp/ui/button"
import { Comment as CommentBubble } from "@pp/ui/comment"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger
} from "@pp/ui/context-menu"
import { LexicalEditor } from "@pp/ui/editor/lexical-editor"
import { Markdown } from "@pp/ui/editor/markdown"
import { CircleCheck } from "@pp/ui/icons"
import { InlineForm, useInlineForm } from "@pp/ui/inline-form"
import { MemberAvatar } from "@pp/ui/member-avatar"
import { Tooltip, TooltipContent, TooltipTrigger } from "@pp/ui/tooltip"
import { useLocation } from "@tanstack/react-router"
import * as Exit from "effect/Exit"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import { useEffect, useRef, useState, type MouseEvent } from "react"

import { me } from "@/features/auth/atoms/auth"
import {
  commentsRequest,
  deleteComment,
  editComment,
  resolveThread
} from "@/features/comments/atoms/comments"
import { commentAuthorName } from "@/features/comments/lib/commentClipboard"
import { useProjectRoute } from "@/features/projects/hooks/useProject"
import { TimelineTime } from "@/features/tickets/components/TimelineTime"
import { useProjectActor } from "@/hooks/useActor"
import { errorMessage } from "@/lib/errorMessage"
import { mutationErrorText } from "@/lib/mutationError"
import { formatRelative } from "@/lib/relativeTime"
import { m } from "@/paraglide/messages"

import { CommentMenuButton, CommentMenuItems } from "./CommentMenu"
import { CreatedTickets } from "./CreatedTickets"

type Mode = "idle" | "edit"

const keepNativeMenu = (event: MouseEvent<HTMLElement>) => {
  const selection = window.getSelection()
  const selecting =
    selection !== null &&
    !selection.isCollapsed &&
    selection.containsNode(event.currentTarget, true)
  const onLink =
    event.target instanceof Element && event.target.closest("a") !== null
  if (selecting || onLink) event.stopPropagation()
}

export type CommentThreadOf = Readonly<{
  root: Comment
  replies: ReadonlyArray<Comment>
}>

export function CommentRow({
  comment,
  thread,
  pending,
  ticketId,
  onEditingChange
}: Readonly<{
  comment: Comment
  thread: CommentThreadOf
  pending: boolean
  ticketId: TicketId
  onEditingChange: (editing: boolean) => void
}>) {
  const { orgSlug, slug } = useProjectRoute()
  const actor = useProjectActor()
  const linkedAuthor =
    comment.author.kind === "user" ? comment.author.user : null
  const authored =
    !pending && comment.origin === "native" && linkedAuthor !== null
      ? { authorId: linkedAuthor.id }
      : null
  const canEdit = authored !== null && CommentPolicy.canEdit(actor, authored)
  const canDelete =
    authored !== null && CommentPolicy.canDelete(actor, authored)
  const req = commentsRequest(orgSlug, slug, ticketId)
  const key = { req, commentId: comment.id }
  const editState = useAtomValue(editComment(key))
  const deleteState = useAtomValue(deleteComment(key))
  const remove = useAtomSet(deleteComment(key), { mode: "promiseExit" })
  const viewer = useAtomValue(me())
  const resolveKey = resolveThread({
    req,
    rootId: thread.root.id,
    viewer: AsyncResult.isSuccess(viewer) ? viewer.value : null
  })
  const resolve = useAtomSet(resolveKey)
  const resolveState = useAtomValue(resolveKey)
  const waiting =
    pending || editState.waiting || deleteState.waiting || resolveState.waiting
  const isRoot = comment.id === thread.root.id
  const last = (thread.replies.at(-1) ?? thread.root).id === comment.id
  const resolution = thread.root.resolution
  const actionError =
    mutationErrorText(
      deleteState,
      () => m.comments_delete_failed(),
      m.comments_delete_failed
    ) ??
    (isRoot
      ? mutationErrorText(
          resolveState,
          () => m.comments_resolve_failed(),
          m.comments_resolve_failed
        )
      : null)

  const [mode, setModeState] = useState<Mode>("idle")
  const setMode = (next: Mode) => {
    setModeState(next)
    onEditingChange(next === "edit")
  }
  const menuButton = useRef<HTMLButtonElement>(null)
  const card = useRef<HTMLDivElement>(null)
  const targeted =
    useLocation({ select: (location) => location.hash }) === comment.id
  useEffect(() => {
    if (!targeted) return undefined
    const frame = requestAnimationFrame(() =>
      card.current?.scrollIntoView({ block: "center", behavior: "smooth" })
    )
    return () => cancelAnimationFrame(frame)
  }, [targeted])
  const menu = {
    comment,
    replies: isRoot ? thread.replies : [],
    ticketId,
    canEdit,
    canDelete,
    onEdit: () => setMode("edit"),
    onDelete: () => remove(),
    resolved: resolution !== null,
    onResolve:
      !pending && actor.call("ticketComments", "resolve") ? resolve : undefined
  }

  return (
    <ContextMenu disabled={pending || mode === "edit"}>
      <ContextMenuTrigger
        render={<div ref={card} id={comment.id} className="scroll-mt-6" />}
      >
        <InlineForm.Root<Mode>
          actions={["edit"]}
          mode={mode}
          onModeChange={setMode}
          fade={false}
          variant="ghost"
          className="ticket-comment"
        >
          <InlineForm.Idle block>
            <CommentBubble
              mark={<AuthorMark author={comment.author} />}
              author={commentAuthorName(comment.author)}
              time={<TimelineTime at={comment.createdAt} />}
              meta={
                <CommentMeta
                  comment={comment}
                  resolution={last ? resolution : null}
                />
              }
              actions={
                pending ? undefined : (
                  <CommentMenuButton ref={menuButton} {...menu} />
                )
              }
              pending={waiting}
              appear={pending}
              targeted={targeted}
              onContextMenu={keepNativeMenu}
              footer={
                actionError && (
                  <p
                    role="alert"
                    className="mt-1 pl-3 text-body text-destructive"
                  >
                    {actionError}
                  </p>
                )
              }
            >
              <Markdown>{comment.body}</Markdown>
              <CreatedTickets tickets={comment.tickets} />
            </CommentBubble>
          </InlineForm.Idle>
          <InlineForm.Form action="edit">
            <EditForm comment={comment} ticketId={ticketId} />
          </InlineForm.Form>
        </InlineForm.Root>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-52">
        <CommentMenuItems {...menu} />
      </ContextMenuContent>
    </ContextMenu>
  )
}

// The author's 20px mark on the rail: their avatar, or for an imported
// comment an orb from the name it was imported with.
export function AuthorMark({
  author
}: Readonly<{ author: Comment["author"] }>) {
  return (
    <MemberAvatar
      member={
        author.kind === "user"
          ? author.user
          : { id: `imported:${author.displayName}`, name: author.displayName }
      }
      size={20}
    />
  )
}

// After the time: edited, where it was imported from, and on a thread's last
// comment whether the thread is resolved.
function CommentMeta({
  comment,
  resolution
}: Readonly<{
  comment: Comment
  resolution: Comment["resolution"]
}>) {
  return (
    <>
      {comment.editedAt && <span>{m.comments_edited_marker()}</span>}
      {comment.origin === "projectproject" && (
        <span>{m.comments_imported_from_projectproject()}</span>
      )}
      {comment.origin === "jira" && (
        <span>{m.comments_imported_from_jira()}</span>
      )}
      {resolution !== null && <ResolvedLabel resolution={resolution} />}
    </>
  )
}

function ResolvedLabel({
  resolution
}: Readonly<{ resolution: NonNullable<Comment["resolution"]> }>) {
  const when = formatRelative(resolution.at)
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span className="inline-flex items-center gap-1 text-caption text-state-success" />
        }
      >
        <CircleCheck className="size-3.5" strokeWidth={2} />
        {m.comments_resolved_label()}
      </TooltipTrigger>
      <TooltipContent>
        {resolution.by === null
          ? m.comments_resolved_at({ when })
          : m.comments_resolved_by({
              name: resolution.by.name || resolution.by.email,
              when
            })}
      </TooltipContent>
    </Tooltip>
  )
}

function EditForm({
  comment,

  ticketId
}: {
  comment: Comment
  ticketId: TicketId
}) {
  const { orgSlug, slug } = useProjectRoute()
  const [body, setBody] = useState(comment.body)
  const [error, setError] = useState<string | null>(null)
  const edit = useAtomSet(
    editComment({
      req: commentsRequest(orgSlug, slug, ticketId),
      commentId: comment.id
    }),
    { mode: "promiseExit" }
  )
  const { close, busy, setBusy } = useInlineForm()

  const save = async () => {
    if (!body.trim() || busy) return
    setBusy(true)
    setError(null)
    const exit = await edit({ body })
    if (Exit.isSuccess(exit)) return close()
    setError(
      mutationErrorText(
        AsyncResult.fromExit(exit),
        errorMessage,
        m.comments_save_failed
      )
    )
    setBusy(false)
  }

  return (
    <CommentBubble
      mark={<AuthorMark author={comment.author} />}
      author={commentAuthorName(comment.author)}
      meta={<span>{m.comments_editing_marker()}</span>}
      editActions={
        <>
          <InlineForm.Cancel>{m.common_cancel_button()}</InlineForm.Cancel>
          <Button size="sm" onClick={save} disabled={busy || !body.trim()}>
            {m.comments_save_button()}
          </Button>
        </>
      }
      footer={
        error && <p className="mt-1 pl-3 text-body text-destructive">{error}</p>
      }
    >
      <LexicalEditor
        markdown={body}
        onDraftChange={setBody}
        autoFocus
        compact
      />
    </CommentBubble>
  )
}
