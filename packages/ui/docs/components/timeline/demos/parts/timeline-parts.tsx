import { Avatar, AvatarFallback } from "@pp/ui/avatar"
import { Badge } from "@pp/ui/badge"
import {
  Comment,
  CommentReplies,
  CommentReplyAction,
  CommentThread
} from "@pp/ui/comment"
import { Bot } from "@pp/ui/icons"
import { MemberAvatar } from "@pp/ui/member-avatar"
import { TimelineActor } from "@pp/ui/timeline"
import type { ReactNode } from "react"

export type Person = Readonly<{ id: string; name: string }>

export const ANA: Person = { id: "u-ana", name: "Ana Ruiz" }
export const BRAM: Person = { id: "u-bram", name: "Bram de Vries" }
export const CHIDI: Person = { id: "u-chidi", name: "Chidi Okafor" }

// The app's TimelineTime: a relative time with the full date as its title.
export function Ago({ children }: Readonly<{ children: string }>) {
  return (
    <time className="text-muted-foreground tabular-nums" title={children}>
      {children}
    </time>
  )
}

// A system actor (GitHub, an automation, an import): its glyph on a plain
// avatar, as the app's ActorMark draws it.
export function SystemMark() {
  return (
    <Avatar aria-hidden className="size-5">
      <AvatarFallback>
        <Bot className="size-3" strokeWidth={2} />
      </AvatarFallback>
    </Avatar>
  )
}

export function Name({ children }: Readonly<{ children: ReactNode }>) {
  return <TimelineActor>{children}</TimelineActor>
}

export function Tag({
  color,
  children
}: Readonly<{ color: string; children: string }>) {
  return (
    <Badge tone={null} size="xs" style={{ "--badge-tone": color }}>
      {children}
    </Badge>
  )
}

// A comment thread as the ticket page shows it: the first comment, its
// replies one step in, and Reply under the last bubble.
export function Bubble({
  member,
  time,
  replies,
  children
}: Readonly<{
  member: Person
  time: string
  replies?: ReadonlyArray<ReactNode>
  children: ReactNode
}>) {
  const comment = (
    <Comment
      mark={<MemberAvatar member={member} size={20} />}
      author={member.name}
      time={<Ago>{time}</Ago>}
    >
      <p>{children}</p>
    </Comment>
  )
  if (replies === undefined) return comment
  return (
    <CommentThread>
      {comment}
      <CommentReplies>
        {replies}
        <CommentReplyAction className="-mt-1.5">Reply</CommentReplyAction>
      </CommentReplies>
    </CommentThread>
  )
}
