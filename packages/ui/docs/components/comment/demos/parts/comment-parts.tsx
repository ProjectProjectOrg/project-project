import { Button } from "@pp/ui/button"
import { Comment, CommentFailed, CommentReplyBox } from "@pp/ui/comment"
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
import {
  CircleCheck,
  CircleDashed,
  Copy,
  FileText,
  Link2,
  ListPlus,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
  X
} from "@pp/ui/icons"
import { MemberAvatar } from "@pp/ui/member-avatar"
import { useState } from "react"

import { Ago, type Person } from "../../../timeline/demos/parts/timeline-parts"

// The app's CommentMenuItems, in its order: edit, resolve, create a ticket
// from the comment, copy, and delete (confirmed in place).
export function CommentMenuItems({
  thread = false,
  onEdit
}: Readonly<{ thread?: boolean; onEdit?: () => void }>) {
  const [resolved, setResolved] = useState(false)
  return (
    <>
      <DropdownMenuItem onClick={onEdit}>
        <Pencil className="size-4" strokeWidth={1.75} />
        Edit
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem onClick={() => setResolved(!resolved)}>
        {resolved ? (
          <CircleDashed className="size-4" strokeWidth={1.75} />
        ) : (
          <CircleCheck className="size-4" strokeWidth={1.75} />
        )}
        {resolved ? "Reopen thread" : "Resolve thread"}
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem>
        <Plus className="size-4" strokeWidth={1.75} />
        Create ticket from comment
      </DropdownMenuItem>
      <DropdownMenuItem>
        <ListPlus className="size-4" strokeWidth={1.75} />
        Create sub-ticket from comment
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem>
        <Link2 className="size-4" strokeWidth={1.75} />
        Copy link
      </DropdownMenuItem>
      <DropdownMenuItem>
        <FileText className="size-4" strokeWidth={1.75} />
        {thread ? "Copy thread as markdown" : "Copy as markdown"}
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuConfirmItem
        icon={<Trash2 className="size-4" strokeWidth={1.75} />}
        label="Delete"
        confirmLabel="Delete this comment?"
        busyLabel="Deleting…"
        describeError={() => "Couldn't delete the comment."}
        onConfirm={() => undefined}
      />
    </>
  )
}

// The app's CommentMenuButton: a ghost icon button that shows on hover (or
// while its menu is open), opening the menu under it.
export function CommentMenu({
  thread = false,
  defaultOpen = false,
  onEdit
}: Readonly<{ thread?: boolean; defaultOpen?: boolean; onEdit?: () => void }>) {
  return (
    <DropdownMenu defaultOpen={defaultOpen} modal={false}>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="square-7"
            aria-label="Comment actions"
            className="opacity-0 transition-opacity group-hover/reveal:opacity-100 group-has-[:focus-visible]/reveal:opacity-100 data-popup-open:opacity-100 pointer-coarse:opacity-100"
          />
        }
      >
        <MoreHorizontal className="size-4" strokeWidth={1.75} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={6} className="w-52">
        <CommentMenuItems thread={thread} onEdit={onEdit} />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// A comment as the app shows it. Edit (in its menu) turns it into the
// editor, with Cancel and Save inside the bubble; onEditingChange lets the
// thread fold its Reply away meanwhile.
export function Said({
  member,
  time,
  thread = false,
  pending = false,
  appear = false,
  menuOpen = false,
  onEditingChange,
  children
}: Readonly<{
  member: Person
  time: string
  thread?: boolean
  pending?: boolean
  appear?: boolean
  menuOpen?: boolean
  onEditingChange?: (editing: boolean) => void
  children: string
}>) {
  const [text, setText] = useState(children)
  const [draft, setDraft] = useState(children)
  const [editing, setEditing] = useState(false)
  const edit = (next: boolean) => {
    setEditing(next)
    onEditingChange?.(next)
  }
  if (editing)
    return (
      <Comment
        mark={<MemberAvatar member={member} size={20} />}
        author={member.name}
        meta={<span>editing…</span>}
        editActions={
          <>
            <Button variant="ghost" size="sm" onClick={() => edit(false)}>
              <X className="size-4" strokeWidth={1.75} />
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={draft.trim() === ""}
              onClick={() => {
                setText(draft.trim())
                edit(false)
              }}
            >
              Save
            </Button>
          </>
        }
      >
        <LexicalEditor
          compact
          markdown={text}
          onDraftChange={setDraft}
          // oxlint-disable-next-line jsx-a11y/no-autofocus -- focus follows Edit, as in the app
          autoFocus
        />
      </Comment>
    )
  return (
    <Comment
      mark={<MemberAvatar member={member} size={20} />}
      author={member.name}
      time={<Ago>{time}</Ago>}
      actions={
        pending ? undefined : (
          <CommentMenu
            thread={thread}
            defaultOpen={menuOpen}
            onEdit={() => edit(true)}
          />
        )
      }
      pending={pending}
      appear={appear}
    >
      <Markdown>{text}</Markdown>
    </Comment>
  )
}

// The app's FailedCommentRow: a comment that failed to send stays in its
// place, ringed in red, with "Not sent" and Retry under it. Its menu edits
// the text (Save sends it again), copies it or discards it.
export function Unsent({
  member,
  time = "just now",
  onRetry,
  onDiscard,
  children
}: Readonly<{
  member: Person
  time?: string
  onRetry: (text: string) => void
  onDiscard?: () => void
  children: string
}>) {
  const [draft, setDraft] = useState(children)
  const [editing, setEditing] = useState(false)
  if (editing)
    return (
      <Comment
        mark={<MemberAvatar member={member} size={20} />}
        author={member.name}
        meta={<span>editing…</span>}
        failed
        editActions={
          <>
            <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
              <X className="size-4" strokeWidth={1.75} />
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={draft.trim() === ""}
              onClick={() => {
                setEditing(false)
                onRetry(draft.trim())
              }}
            >
              Save
            </Button>
          </>
        }
      >
        <LexicalEditor
          compact
          markdown={children}
          onDraftChange={setDraft}
          // oxlint-disable-next-line jsx-a11y/no-autofocus -- focus follows Edit, as in the app
          autoFocus
        />
      </Comment>
    )
  return (
    <Comment
      mark={<MemberAvatar member={member} size={20} />}
      author={member.name}
      time={<Ago>{time}</Ago>}
      failed
      actions={
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="square-7"
                aria-label="Comment actions"
                className="opacity-0 transition-opacity group-hover/reveal:opacity-100 group-has-[:focus-visible]/reveal:opacity-100 data-popup-open:opacity-100 pointer-coarse:opacity-100"
              />
            }
          >
            <MoreHorizontal className="size-4" strokeWidth={1.75} />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" sideOffset={6} className="w-52">
            <DropdownMenuItem onClick={() => setEditing(true)}>
              <Pencil className="size-4" strokeWidth={1.75} />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => void navigator.clipboard.writeText(children)}
            >
              <Copy className="size-4" strokeWidth={1.75} />
              Copy text
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuConfirmItem
              icon={<Trash2 className="size-4" strokeWidth={1.75} />}
              label="Discard"
              confirmLabel="Discard this comment?"
              busyLabel="Discarding…"
              describeError={() => "Couldn't discard the comment."}
              onConfirm={() => onDiscard?.()}
            />
          </DropdownMenuContent>
        </DropdownMenu>
      }
      footer={
        <CommentFailed
          message="Not sent."
          retryLabel="Retry"
          onRetry={() => onRetry(children)}
        />
      }
    >
      <Markdown>{children}</Markdown>
    </Comment>
  )
}

// The app's ReplyComposer: the box opens focused, ⌘↵ sends, and clicking
// away closes it only while it's still empty, so nothing you typed is lost.
export function ReplyBox({
  member,
  onClose
}: Readonly<{ member: Person; onClose: () => void }>) {
  const [body, setBody] = useState("")
  return (
    <CommentReplyBox
      mark={<MemberAvatar member={member} size={20} />}
      author={member.name}
      time={<Ago>just now</Ago>}
      submit={
        <Button size="sm" disabled={body.trim() === ""}>
          Reply
        </Button>
      }
      onBlur={(event) => {
        const leaving = !event.currentTarget.contains(event.relatedTarget)
        if (leaving && body.trim() === "") onClose()
      }}
    >
      <LexicalEditor
        compact
        markdown=""
        placeholder="Leave a reply…"
        onDraftChange={setBody}
        // oxlint-disable-next-line jsx-a11y/no-autofocus -- focus follows the click on Reply, as in the app
        autoFocus
      />
    </CommentReplyBox>
  )
}
