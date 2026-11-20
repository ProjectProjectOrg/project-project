import { useAtomValue } from "@effect/atom-react"
import { type TicketFlag } from "@pp/shared"
import { Markdown } from "@pp/ui/editor/markdown"
import { MentionScopeProvider } from "@pp/ui/editor/mentions/scope"
import { MemberAvatar } from "@pp/ui/member-avatar"
import * as Result from "effect/reactivity/AsyncResult"

import { project } from "@/features/projects/atoms/projects"
import {
  useProjectRequest,
  useProjectRoute
} from "@/features/projects/hooks/useProject"
import { TimelineTime } from "@/features/tickets/components/TimelineTime"
import { m } from "@/paraglide/messages"

export function FlagPreview({ flag }: Readonly<{ flag: TicketFlag }>) {
  const { orgSlug, slug } = useProjectRoute()
  const detail = useAtomValue(project(useProjectRequest()))
  const members = Result.isSuccess(detail) ? detail.value.members : undefined
  const member = members?.find((candidate) => candidate.id === flag.by)
  return (
    <div className="flex flex-col gap-1.5 px-2 py-1.5">
      <div className="flex min-w-0 items-center gap-1.5 text-caption text-muted-foreground">
        {member !== undefined && <MemberAvatar member={member} size={16} />}
        <span className="min-w-0 truncate">
          {m.tickets_flag_by({
            name:
              member?.name ||
              member?.email ||
              m.tickets_activity_actor_unknown()
          })}
        </span>
        <span aria-hidden>·</span>
        <TimelineTime at={flag.at} className="shrink-0" />
      </div>
      {flag.reason !== undefined && (
        <MentionScopeProvider scope={{ orgSlug, slug, members }}>
          <Markdown size="compact" blocks="flat">
            {flag.reason}
          </Markdown>
        </MentionScopeProvider>
      )}
    </div>
  )
}
