import type { Comment, TicketId } from "@pp/shared"
import {
  CircleCheck,
  CircleDashed,
  FileText,
  Link2,
  MoreHorizontal,
  Pencil,
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
  commentUrl
} from "@/features/comments/lib/commentClipboard"
import { useProjectRoute } from "@/features/projects/hooks/useProject"
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
