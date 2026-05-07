import { Link } from "@tanstack/react-router"
import { Badge } from "@/components/ui/badge"
import { MemberAvatar } from "@/components/MemberAvatar"
import { useMentionScope } from "@/mentions/scope"
import type { MentionType } from "@projectproject/shared"

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
  if (type === "user") {
    const member = scope?.members?.find((m) => m.id === id)
    const inner = (
      <>
        {member && (
          <MemberAvatar member={member} size={12} className="-ml-0.5" />
        )}
        <span>@{member?.name ?? label}</span>
      </>
    )
    return (
      <Badge
        tone="blue"
        size="xs"
        asChild={!!scope}
        className="align-middle"
        contentEditable={false}
      >
        {scope ? (
          <Link
            to="/orgs/$orgSlug/projects/$slug/members"
            params={{ orgSlug: scope.orgSlug, slug: scope.slug }}
            onMouseDown={(e) => e.preventDefault()}
          >
            {inner}
          </Link>
        ) : (
          inner
        )}
      </Badge>
    )
  }
  const inner = <>{id}</>
  return (
    <Badge
      tone="muted"
      size="xs"
      asChild={!!scope}
      className="font-mono align-middle"
      contentEditable={false}
    >
      {scope ? (
        <Link
          to="/orgs/$orgSlug/projects/$slug"
          params={{ orgSlug: scope.orgSlug, slug: scope.slug }}
          search={{ ticket: id }}
          onMouseDown={(e) => e.preventDefault()}
        >
          {inner}
        </Link>
      ) : (
        inner
      )}
    </Badge>
  )
}
