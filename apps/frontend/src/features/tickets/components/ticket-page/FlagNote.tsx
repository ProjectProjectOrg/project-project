import type { Member, TicketFlag } from "@pp/shared"
import { Flag } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Markdown } from "@/features/editor/components/Markdown"
import { MentionScopeProvider } from "@/features/editor/mentions/scope"
import { useProjectRoute } from "@/features/projects/hooks/useProject"
import { TimelineTime } from "@/features/tickets/components/TimelineTime"
import { m } from "@/paraglide/messages"

export function FlagNote({
  flag,
  members,
  onRemove
}: Readonly<{
  flag: TicketFlag
  members: ReadonlyArray<Member>
  onRemove: (() => void) | null
}>) {
  const { orgSlug, slug } = useProjectRoute()
  const member = members.find((candidate) => candidate.id === flag.by)
  return (
    <div
      role="note"
      className="flex items-start gap-2.5 rounded-lg bg-state-danger/10 py-2 pr-2 pl-3"
    >
      <Flag
        className="mt-[3px] size-3.5 shrink-0 text-state-danger"
        strokeWidth={1.75}
        aria-label={m.tickets_flag_indicator_aria_label()}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        {flag.reason !== undefined && (
          <MentionScopeProvider scope={{ orgSlug, slug, members }}>
            <Markdown size="compact" blocks="flat" className="text-body">
              {flag.reason}
            </Markdown>
          </MentionScopeProvider>
        )}
        <span className="flex min-w-0 items-center gap-1 text-caption text-muted-foreground">
          <span className="truncate">
            {m.tickets_flag_by({
              name:
                member?.name ||
                member?.email ||
                m.tickets_activity_actor_unknown()
            })}
          </span>
          <span aria-hidden>·</span>
          <TimelineTime at={flag.at} className="shrink-0" />
        </span>
      </div>
      {onRemove !== null && (
        <Button type="button" variant="ghost" size="xs" onClick={onRemove}>
          {m.tickets_mark_remove_flag()}
        </Button>
      )}
    </div>
  )
}
