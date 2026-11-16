import { parseTicketMentionId, TicketId, type MentionType } from "@pp/shared"
import * as Schema from "effect/Schema"

import { Badge } from "../../components/badge"
import { MemberAvatar } from "../../components/member-avatar"
import { Popover, PopoverTrigger } from "../../components/popover"
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
  const { mentionHref, renderTicketPreview } = useEditorServices()
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

  const target = parseTicketMentionId(id)
  const ticketId = target.ticketId
  if (!scope || !isTicketId(ticketId)) {
    return (
      <Badge
        tone="muted"
        size="xs"
        className="inline-chip font-mono"
        contentEditable={false}
      >
        {ticketId}
      </Badge>
    )
  }
  const ticketScope =
    target.projectSlug === null || target.projectSlug === scope.slug
      ? scope
      : { orgSlug: scope.orgSlug, slug: target.projectSlug }

  // The popover's focus guards land beside its trigger; inside an
  // inline-flex wrapper they take no room in the line, so opening the card
  // doesn't push the text down.
  return (
    <span className="inline-chip inline-flex">
      <Popover>
        <PopoverTrigger
          render={
            <Badge
              tone="muted"
              size="xs"
              className="font-mono"
              render={
                <a
                  href={mentionHref.ticket(ticketScope, ticketId)}
                  ref={linkRef}
                  onMouseDown={(e) => e.preventDefault()}
                />
              }
            />
          }
          openOnHover
          // It renders the ticket's link, not a button.
          nativeButton={false}
          contentEditable={false}
        >
          {ticketId}
        </PopoverTrigger>
        {renderTicketPreview(ticketId, ticketScope)}
      </Popover>
    </span>
  )
}
