import { useAtomSet, useAtomValue } from "@effect/atom-react"
import {
  canHoldChildren,
  isEpic,
  type Comment,
  type TicketId
} from "@pp/shared"
import { Button } from "@pp/ui/button"
import {
  DropdownMenu,
  DropdownMenuConfirmItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@pp/ui/dropdown-menu"
import {
  CircleCheck,
  CircleDashed,
  FileText,
  Link2,
  ListPlus,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2
} from "@pp/ui/icons"
import type * as Exit from "effect/Exit"
import * as Result from "effect/reactivity/AsyncResult"
import type { Ref } from "react"

import { useOpenCommandMenu } from "@/features/command-menu/hooks/useOpenCommandMenu"
import {
  commentMarkdown,
  commentUrl
} from "@/features/comments/lib/commentClipboard"
import { ticketFromComment } from "@/features/comments/lib/ticketFromComment"
import { useProjectRoute } from "@/features/projects/hooks/useProject"
import {
  newTicketRequest,
  type RelatedKind
} from "@/features/tickets/atoms/createTicket"
import {
  ticketDetail,
  ticketRequest
} from "@/features/tickets/atoms/ticketDetail"
import { useProjectActor } from "@/hooks/useActor"
import { describeCause } from "@/lib/errorMessage"
import { m } from "@/paraglide/messages"

export type CommentMenuProps = Readonly<{
  comment: Comment
  replies: ReadonlyArray<Comment>
  ticketId: TicketId
  canEdit: boolean
  canDelete: boolean
  onEdit: () => void
  onDelete: () => Promise<Exit.Exit<unknown, unknown>>
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
  onDelete,
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
          <DropdownMenuConfirmItem
            icon={<Trash2 className="size-4" strokeWidth={1.75} />}
            label={m.comments_menu_delete()}
            confirmLabel={m.comments_delete_confirm()}
            busyLabel={m.common_deleting_button()}
            describeError={describeCause}
            onConfirm={onDelete}
          />
        </>
      )}
    </>
  )
}

function CreateTicketItems({
  comment,
  ticketId
}: Readonly<{ comment: Comment; ticketId: TicketId }>) {
  const { orgSlug, slug } = useProjectRoute()
  const canCreate = useProjectActor().call("tickets", "create")
  const setRequest = useAtomSet(newTicketRequest)
  const openCommandMenu = useOpenCommandMenu(orgSlug)
  const source = useAtomValue(
    ticketDetail(ticketRequest(orgSlug, slug, ticketId))
  )
  if (!canCreate) return null
  const ticket = Result.isSuccess(source) ? source.value : null
  const open = (kind: RelatedKind) => {
    setRequest({
      orgSlug,
      projectSlug: slug,
      ...ticketFromComment(comment, slug, ticketId),
      related: { kind, ticketId },
      fromComment: { ticketId, commentId: comment.id }
    })
    openCommandMenu("createTicket")
  }
  return (
    <>
      <DropdownMenuItem
        onClick={() => open("related")}
        className="cursor-pointer"
      >
        <Plus className="size-4" strokeWidth={1.75} />
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
            variant="ghost"
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
