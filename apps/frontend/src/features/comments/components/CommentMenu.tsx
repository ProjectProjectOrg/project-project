import { useAtomSet, useAtomValue } from "@effect/atom-react"
import {
  canHoldChildren,
  isEpic,
  type Comment,
  type TicketId
} from "@pp/shared"
import * as Result from "effect/reactivity/AsyncResult"
import {
  CircleCheck,
  CircleDashed,
  FileText,
  Link2,
  ListPlus,
  MoreHorizontal,
  Pencil,
  SquarePlus,
  Trash2
} from "lucide-react"
import type { Ref } from "react"

import { Button } from "@/components/ui/button"
import { ConfirmButton } from "@/components/ui/confirm-button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import {
  commentMarkdown,
  commentPath,
  commentUrl
} from "@/features/comments/lib/commentClipboard"
import { ticketFromComment } from "@/features/comments/lib/ticketFromComment"
import { useProjectRoute } from "@/features/projects/hooks/useProject"
import {
  createTicketDialog,
  type RelatedKind
} from "@/features/tickets/atoms/createTicketDialog"
import {
  ticketDetail,
  ticketRequest
} from "@/features/tickets/atoms/ticketDetail"
import { useProjectActor } from "@/hooks/useActor"
import { m } from "@/paraglide/messages"

export type CommentMenuProps = Readonly<{
  comment: Comment
  replies: ReadonlyArray<Comment>
  ticketId: TicketId
  canEdit: boolean
  canDelete: boolean
  onEdit: () => void
  resolved: boolean
  onResolve: ((resolved: boolean) => void) | undefined
}>

const copy = (text: string) => void navigator.clipboard.writeText(text)

export function CommentMenuItems({
  comment,
  replies,
  ticketId,
  canEdit,
  canDelete,
  onEdit,
  resolved,
  onResolve
}: CommentMenuProps) {
  const location = useProjectRoute()
  const url = commentUrl(location, ticketId, comment.id)
  return (
    <>
      {canEdit && (
        <>
          <DropdownMenuItem onClick={onEdit} className="cursor-pointer">
            <Pencil className="size-4" strokeWidth={1.75} />
            {m.comments_edit_button()}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
        </>
      )}
      {onResolve !== undefined && (
        <>
          <DropdownMenuItem
            onClick={() => onResolve(!resolved)}
            className="cursor-pointer"
          >
            {resolved ? (
              <CircleDashed className="size-4" strokeWidth={1.75} />
            ) : (
              <CircleCheck className="size-4" strokeWidth={1.75} />
            )}
            {resolved ? m.comments_menu_unresolve() : m.comments_menu_resolve()}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
        </>
      )}
      <CreateTicketItems comment={comment} ticketId={ticketId} />
      <DropdownMenuItem onClick={() => copy(url)} className="cursor-pointer">
        <Link2 className="size-4" strokeWidth={1.75} />
        {m.comments_menu_copy_link()}
      </DropdownMenuItem>
      <DropdownMenuItem
        onClick={() =>
          copy(commentMarkdown([comment, ...replies], ticketId, url))
        }
        className="cursor-pointer"
      >
        <FileText className="size-4" strokeWidth={1.75} />
        {replies.length > 0
          ? m.comments_menu_copy_thread_markdown()
          : m.comments_menu_copy_markdown()}
      </DropdownMenuItem>
      {canDelete && (
        <>
          <DropdownMenuSeparator />
          <ConfirmButton.MenuItem
            variant="destructive"
            className="cursor-pointer"
          >
            <Trash2 className="size-4" strokeWidth={1.75} />
            {m.comments_menu_delete()}
          </ConfirmButton.MenuItem>
        </>
      )}
    </>
  )
}

function CreateTicketItems({
  comment,
  ticketId
}: Readonly<{ comment: Comment; ticketId: TicketId }>) {
  const location = useProjectRoute()
  const { orgSlug, slug } = location
  const canCreate = useProjectActor().call("tickets", "create")
  const openDialog = useAtomSet(createTicketDialog)
  const source = useAtomValue(
    ticketDetail(ticketRequest(orgSlug, slug, ticketId))
  )
  if (!canCreate) return null
  const ticket = Result.isSuccess(source) ? source.value : null
  const open = (kind: RelatedKind) =>
    openDialog({
      orgSlug,
      projectSlug: slug,
      ...ticketFromComment(
        comment,
        slug,
        ticketId,
        commentPath(location, ticketId, comment.id)
      ),
      related: { kind, ticketId },
      fromComment: { ticketId, commentId: comment.id }
    })
  return (
    <>
      <DropdownMenuItem
        onClick={() => open("related")}
        className="cursor-pointer"
      >
        <SquarePlus className="size-4" strokeWidth={1.75} />
        {m.comments_menu_create_ticket()}
      </DropdownMenuItem>
      {ticket !== null && canHoldChildren(ticket, ticket.parent) && (
        <DropdownMenuItem
          onClick={() => open("subTicket")}
          className="cursor-pointer"
        >
          <ListPlus className="size-4" strokeWidth={1.75} />
          {isEpic(ticket)
            ? m.comments_menu_create_epic_ticket()
            : m.comments_menu_create_sub_ticket()}
        </DropdownMenuItem>
      )}
      <DropdownMenuSeparator />
    </>
  )
}

export function CommentMenuButton({
  ref,
  ...menu
}: CommentMenuProps & Readonly<{ ref: Ref<HTMLButtonElement> }>) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            ref={ref}
            type="button"
            variant="quiet"
            size="square-7"
            aria-label={m.comments_menu_aria_label()}
            className="opacity-0 transition-opacity group-hover/reveal:opacity-100 group-has-[:focus-visible]/reveal:opacity-100 data-popup-open:opacity-100 pointer-coarse:opacity-100"
          >
            <MoreHorizontal className="size-4" strokeWidth={1.75} />
          </Button>
        }
      />
      <DropdownMenuContent align="end" sideOffset={6} className="w-52">
        <CommentMenuItems {...menu} />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
