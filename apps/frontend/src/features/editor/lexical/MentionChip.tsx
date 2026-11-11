import { parseTicketMentionId, TicketId, type MentionType } from "@pp/shared"
import { Link } from "@tanstack/react-router"
import * as Schema from "effect/Schema"

import { Badge } from "@/components/ui/badge"
import { Popover, PopoverTrigger } from "@/components/ui/popover"
import { useInAppLink } from "@/features/editor/hooks/useInAppLink"
import { useMentionScope } from "@/features/editor/mentions/scope"
import { TicketHoverCard } from "@/features/tickets/components/TicketHoverCard"

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
  if (type === "user") {
    const member = scope?.members?.find((m) => m.id === id)
    return (
      <Badge
        tone="blue"
        size="xs"
        render={
          scope ? (
            <Link
              to="/orgs/$orgSlug/projects/$slug/settings/team"
              params={{ orgSlug: scope.orgSlug, slug: scope.slug }}
              ref={linkRef}
              onMouseDown={(e) => e.preventDefault()}
            />
          ) : undefined
        }
        className="align-middle"
        contentEditable={false}
      >
        <span className="underline decoration-current/40 underline-offset-[0.18em]">
          @{member?.name ?? label}
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
        className="align-baseline font-mono"
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

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Badge
            tone="muted"
            size="xs"
            className="align-baseline font-mono"
            render={
              <Link
                to="/orgs/$orgSlug/projects/$slug/tickets/$id"
                params={{
                  orgSlug: ticketScope.orgSlug,
                  slug: ticketScope.slug,
                  id: ticketId
                }}
                ref={linkRef}
                onMouseDown={(e) => e.preventDefault()}
              />
            }
          />
        }
        openOnHover
        contentEditable={false}
      >
        {ticketId}
      </PopoverTrigger>
      <TicketHoverCard ticketId={ticketId} scope={ticketScope} />
    </Popover>
  )
}
