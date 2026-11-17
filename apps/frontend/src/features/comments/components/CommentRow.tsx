import { useAtomValue, useAtomSet } from "@effect/atom-react"
import { CommentPolicy } from "@pp/access/policies"
import type { Comment, TicketId } from "@pp/shared"
import { useLocation } from "@tanstack/react-router"
import * as Exit from "effect/Exit"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import { CircleCheck } from "lucide-react"
import { useEffect, useRef, useState, type MouseEvent } from "react"

import { Button } from "@/components/ui/button"
import { ConfirmButton } from "@/components/ui/confirm-button"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger
} from "@/components/ui/context-menu"
import { InlineForm, useInlineForm } from "@/components/ui/inline-form"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@/components/ui/tooltip"
import { me } from "@/features/auth/atoms/auth"
import {
  commentsRequest,
  deleteComment,
  editComment,
  resolveThread
} from "@/features/comments/atoms/comments"
import { commentAuthorName } from "@/features/comments/lib/commentClipboard"
import { LexicalEditor } from "@/features/editor/components/LexicalEditor"
import { Markdown } from "@/features/editor/components/Markdown"
import { MemberAvatar } from "@/features/members/components/MemberAvatar"
import { useProjectRoute } from "@/features/projects/hooks/useProject"
import { TimelineTime } from "@/features/tickets/components/TimelineTime"
import { useProjectActor } from "@/hooks/useActor"
import { errorMessage } from "@/lib/errorMessage"
import { mutationErrorText } from "@/lib/mutationError"
import { formatRelative } from "@/lib/relativeTime"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

import { CommentMenuButton, CommentMenuItems } from "./CommentMenu"
import { CreatedTickets } from "./CreatedTickets"

type Mode = "idle" | "edit"

const keepNativeMenu = (event: MouseEvent<HTMLElement>) => {
  const selection = window.getSelection()
  const selecting =
    selection !== null &&
    !selection.isCollapsed &&
    event.currentTarget.contains(selection.anchorNode)
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
  ticketId
}: Readonly<{
  comment: Comment
  thread: CommentThreadOf
  pending: boolean
  ticketId: TicketId
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
  const waiting = pending || editState.waiting || deleteState.waiting
  const remove = useAtomSet(deleteComment(key), { mode: "promiseExit" })
  const viewer = useAtomValue(me())
  const resolve = useAtomSet(
    resolveThread({
      req,
      rootId: thread.root.id,
      viewer: AsyncResult.isSuccess(viewer) ? viewer.value : null
    })
  )
  const isRoot = comment.id === thread.root.id
  const last = (thread.replies.at(-1) ?? thread.root).id === comment.id
  const resolution = thread.root.resolution
  const deleteError = mutationErrorText(
    deleteState,
    () => m.comments_delete_failed(),
    m.comments_delete_failed
  )

  const [mode, setMode] = useState<Mode>("idle")
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
    resolved: resolution !== null,
    onResolve:
      !pending && actor.call("ticketComments", "resolve") ? resolve : undefined
  }

  return (
    <ConfirmButton.Root bare>
      <ContextMenu disabled={pending || mode === "edit"}>
        <ContextMenuTrigger
          render={
            <div
              ref={card}
              id={comment.id}
              data-targeted={targeted ? "" : undefined}
              className="group/reveal scroll-mt-6"
            />
          }
        >
          <InlineForm.Root<Mode>
            actions={["edit"]}
            mode={mode}
            onModeChange={setMode}
            fade={false}
            variant="ghost"
            className={cn(
              "ticket-comment [--fs-body:13px] [--lh-body:20px] [--text-body--line-height:20px] [--text-body:13px]",
              waiting && "animate-pulse"
            )}
          >
            <InlineForm.Idle block>
              <CommentHeader
                comment={comment}
                resolution={last ? resolution : null}
              >
                {!pending && <CommentMenuButton ref={menuButton} {...menu} />}
              </CommentHeader>
              <div
                className={cn("pt-1 pr-4 pb-3.5", isRoot ? "pl-4" : "pl-11")}
                onContextMenu={keepNativeMenu}
              >
                <Markdown>{comment.body}</Markdown>
                <CreatedTickets tickets={comment.tickets} />
              </div>
              {deleteError && (
                <p
                  role="alert"
                  className="px-4 pb-3.5 text-body text-destructive"
                >
                  {deleteError}
                </p>
              )}
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
      {canDelete && (
        <ConfirmButton.Popover anchor={menuButton} className="w-72">
          <ConfirmButton.Action
            layout="stacked"
            prompt={m.comments_delete_confirm()}
            label={m.common_delete_confirm_button()}
            busyLabel={m.common_deleting_button()}
            onConfirm={() => remove()}
          />
        </ConfirmButton.Popover>
      )}
    </ConfirmButton.Root>
  )
}

function CommentHeader({
  comment,
  resolution = null,
  children
}: {
  comment: Comment
  resolution?: Comment["resolution"]
  children: React.ReactNode
}) {
  const author = comment.author
  return (
    <header className="flex min-h-7 items-center justify-between gap-2 pt-1.5 pr-1.5 pl-4 text-body">
      <div className="flex items-center gap-2">
        {author.kind === "user" && (
          <MemberAvatar member={author.user} size={20} />
        )}
        <span className="font-semibold">{commentAuthorName(author)}</span>
        <TimelineTime at={comment.createdAt} />
        {comment.editedAt && (
          <span className="text-caption text-muted-foreground">
            {m.comments_edited_marker()}
          </span>
        )}
        {comment.origin === "jira" && (
          <span className="text-caption text-muted-foreground">
            {m.comments_imported_from_jira()}
          </span>
        )}
        {resolution !== null && <ResolvedLabel resolution={resolution} />}
      </div>
      {children}
    </header>
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
              name: resolution.by.name ?? resolution.by.email,
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
    <>
      <CommentHeader comment={comment}>
        <span className="text-body text-muted-foreground">
          {m.comments_editing_marker()}
        </span>
      </CommentHeader>
      <div className="px-4 pt-1">
        <LexicalEditor
          markdown={body}
          onDraftChange={setBody}
          autoFocus
          compact
        />
      </div>
      {error && <p className="px-4 text-body text-destructive">{error}</p>}
      <div className="flex justify-end gap-2 p-1.5">
        <InlineForm.Cancel />
        <Button size="sm" onClick={save} disabled={busy || !body.trim()}>
          {m.comments_save_button()}
        </Button>
      </div>
    </>
  )
}
