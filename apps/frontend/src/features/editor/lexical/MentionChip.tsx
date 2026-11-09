import { TicketId, type MentionType } from "@pp/shared"
import { Link } from "@tanstack/react-router"
import * as Schema from "effect/Schema"

import { Badge } from "@/components/ui/badge"
import { Popover, PopoverTrigger } from "@/components/ui/popover"
import { useInAppLink } from "@/features/editor/hooks/useInAppLink"
import { useMentionScope } from "@/features/editor/mentions/scope"
import { TicketHoverCard } from "@/features/tickets/components/TicketHoverCard"

const makeTicketId = Schema.decodeUnknownSync(TicketId)

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

  if (!scope) {
    return (
      <Badge
        tone="muted"
        size="xs"
        className="align-middle font-mono"
        contentEditable={false}
      >
        {id}
      </Badge>
    )
  }

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Link
            to="/orgs/$orgSlug/projects/$slug/tickets/$id"
            params={{ orgSlug: scope.orgSlug, slug: scope.slug, id }}
            ref={linkRef}
            onMouseDown={(e) => e.preventDefault()}
          />
        }
        openOnHover
        contentEditable={false}
      >
        <Badge
          tone="muted"
          size="xs"
          className="align-middle font-mono"
          contentEditable={false}
        >
          {id}
        </Badge>
      </PopoverTrigger>
      <TicketHoverCard ticketId={makeTicketId(id)} scope={scope} />
    </Popover>
  )
}
