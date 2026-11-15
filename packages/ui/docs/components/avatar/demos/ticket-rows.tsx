import { Check, Circle, CircleDot } from "@pp/ui/icons"
import { AvatarStack, MemberAvatar } from "@pp/ui/member-avatar"

import { PEOPLE } from "./people"

const ROWS = [
  {
    id: "WEB-19",
    title: "Investigate image uploads",
    icon: CircleDot,
    tone: "text-state-info",
    people: [0]
  },
  {
    id: "WEB-18",
    title: "Refine session handling",
    icon: Circle,
    tone: "text-muted-foreground",
    people: [1, 2]
  },
  {
    id: "WEB-17",
    title: "Migrate the audit log",
    icon: Check,
    tone: "text-state-success",
    people: [3, 0, 1, 4]
  }
] as const

export default function TicketRows() {
  return (
    <div className="w-full max-w-xl divide-y divide-border/60">
      {ROWS.map(({ id, title, icon: Icon, tone, people }) => {
        const assignees = people.map((index) => PEOPLE[index])
        return (
          <div key={id} className="flex h-12 items-center gap-3 px-3">
            <Icon className={`size-4 shrink-0 ${tone}`} strokeWidth={1.75} />
            <span className="font-mono text-caption text-muted-foreground tabular-nums">
              {id}
            </span>
            <span className="min-w-0 flex-1 truncate text-body font-semibold">
              {title}
            </span>
            {assignees.length === 1 ? (
              <MemberAvatar member={assignees[0]} size={24} />
            ) : (
              <AvatarStack subjects={assignees} size={24} max={3} />
            )}
          </div>
        )
      })}
    </div>
  )
}
