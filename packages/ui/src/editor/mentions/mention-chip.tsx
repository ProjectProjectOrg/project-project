import {
  parseCommentMentionId,
  parseTicketMentionId,
  TicketId,
  type MentionType
} from "@pp/shared"
import * as Schema from "effect/Schema"

import { Badge } from "../../components/badge"
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger
} from "../../components/hover-card"
import { MessageSquare } from "../../components/icons"
import { MemberAvatar } from "../../components/member-avatar"
import { useEditorServices } from "../services"
import { useInAppLink } from "../use-in-app-link"
import { useMentionScope } from "./scope"

const isTicketId = Schema.is(TicketId)

export function MentionChip({
  type,
  id,
  label
}: {
  type: MentionType
  id: string
  label: string
}) {
  const scope = useMentionScope()
  const linkRef = useInAppLink()
  const { mentionHref, renderTicketPreview, renderCommentPreview } =
    useEditorServices()
  if (type === "user") {
    const member = scope?.members?.find((m) => m.id === id)
    return (
      <Badge
        tone="blue"
        size="xs"
        render={
          scope ? (
            <a
              href={mentionHref.user(scope, id)}
              ref={linkRef}
              onMouseDown={(e) => e.preventDefault()}
            />
          ) : undefined
        }
        className="inline-chip pl-0.5"
        contentEditable={false}
      >
        {/* Their avatar stands in for the "@": small, so the name beside it
            carries who it is. */}
        <MemberAvatar
          member={member ?? { id, name: label, email: null, image: null }}
          size={16}
        />
        <span className="underline decoration-current/40 underline-offset-[0.18em]">
          {member?.name ?? label}
        </span>
      </Badge>
    )
  }

  // A comment mention points at a ticket too: its id is the ticket's plus
  // "/<comment id>".
  const comment = type === "comment" ? parseCommentMentionId(id) : null
  const target = type === "comment" ? comment : parseTicketMentionId(id)
  const ticketId = target?.ticketId
  if (!scope || target === null || !isTicketId(ticketId)) {
    return (
      <Badge
        tone="muted"
        size="xs"
        className="inline-chip tabular-nums"
        contentEditable={false}
      >
        {type === "comment" ? label : ticketId}
      </Badge>
    )
  }
  const ticketScope =
    target.projectSlug === null || target.projectSlug === scope.slug
      ? scope
      : { orgSlug: scope.orgSlug, slug: target.projectSlug }

  // The ticket's peek is a hover card, drawn by the tooltip host like every
  // other hover, so it glides in from a tooltip and back. The chip stays a
  // link to the ticket (or the comment).
  return (
    <span className="inline-chip inline-flex">
      <HoverCard>
        <HoverCardTrigger
          render={
            <Badge
              tone="muted"
              size="xs"
              className="tabular-nums"
              render={
                <a
                  href={
                    comment === null
                      ? mentionHref.ticket(ticketScope, ticketId)
                      : `${mentionHref.ticket(ticketScope, ticketId)}#${encodeURIComponent(comment.commentId)}`
                  }
                  ref={linkRef}
                  onMouseDown={(e) => e.preventDefault()}
                />
              }
            />
          }
          contentEditable={false}
        >
          {type === "comment" && (
            <MessageSquare className="size-3" strokeWidth={1.75} aria-hidden />
          )}
          {ticketId}
        </HoverCardTrigger>
        <HoverCardContent className="w-80 p-3">
          {comment === null
            ? renderTicketPreview(ticketId, ticketScope)
            : renderCommentPreview(ticketId, comment.commentId, ticketScope)}
        </HoverCardContent>
      </HoverCard>
    </span>
  )
}
