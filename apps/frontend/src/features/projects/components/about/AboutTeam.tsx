import type { ProjectDetail } from "@pp/shared"
import { Button } from "@pp/ui/button"
import { MemberAvatar } from "@pp/ui/member-avatar"
import { Link } from "@tanstack/react-router"

import { ROLE_META } from "@/features/members/lib/roles"
import { useProjectRoute } from "@/features/projects/hooks/useProject"
import { MetaRow } from "@/features/tickets/components/ticket-page/MetaRow"
import { m } from "@/paraglide/messages"

import { SectionLink } from "./SectionLink"

const VISIBLE_MEMBERS = 6

export function AboutTeam({
  members,
  pendingMembers
}: Readonly<Pick<ProjectDetail, "members" | "pendingMembers">>) {
  const { orgSlug, slug } = useProjectRoute()
  const team = {
    to: "/settings/orgs/$orgSlug/projects/$slug/team",
    params: { orgSlug, slug }
  } as const
  const hidden = members.length - VISIBLE_MEMBERS
  return (
    <MetaRow
      label={<SectionLink {...team} label={m.project_about_team_label()} />}
    >
      <ul className="flex w-full flex-col gap-1">
        {members.slice(0, VISIBLE_MEMBERS).map((member) => (
          <li
            key={member.id}
            className="flex h-7 min-w-0 items-center gap-2 text-body"
          >
            <MemberAvatar member={member} size={20} />
            <span className="min-w-0 truncate">
              {member.name || member.email}
            </span>
            <span className="ml-auto shrink-0 text-caption text-muted-foreground">
              {ROLE_META[member.role].label()}
            </span>
          </li>
        ))}
      </ul>
      {hidden > 0 || pendingMembers.length > 0 ? (
        <Button
          variant="ghost"
          size="inline"
          className="mt-1 -ml-1.5 w-fit max-w-full justify-start"
          render={<Link {...team} />}
        >
          {[
            hidden > 0 ? m.project_about_team_more({ count: hidden }) : null,
            pendingMembers.length > 0
              ? m.project_about_team_pending({ count: pendingMembers.length })
              : null
          ]
            .filter((part) => part !== null)
            .join(" · ")}
        </Button>
      ) : null}
    </MetaRow>
  )
}
