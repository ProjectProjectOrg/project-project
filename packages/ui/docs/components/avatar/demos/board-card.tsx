import { ChevronUp, Minus, UserRound } from "@pp/ui/icons"
import { AvatarStack, MemberAvatar } from "@pp/ui/member-avatar"
import type { ReactNode } from "react"

import { PEOPLE } from "./people"

function Card({
  id,
  title,
  priority,
  assignees
}: Readonly<{
  id: string
  title: string
  priority: ReactNode
  assignees: ReactNode
}>) {
  return (
    <div className="flex w-64 flex-col gap-2.5 rounded-lg bg-surface-3 px-2.5 pt-2 pb-2 shadow-surface-1">
      <div className="flex flex-col gap-1">
        <div className="flex h-6 items-center gap-1.5 text-caption text-muted-foreground">
          <span className="tabular-nums">{id}</span>
          {/* 24px, 8px from the card's top and right edges alike. */}
          <span className="-mr-0.5 ml-auto flex items-center">{assignees}</span>
        </div>
        <div className="line-clamp-2 min-h-[2lh] text-subtitle leading-snug font-semibold">
          {title}
        </div>
      </div>
      <span className="grid size-6 place-items-center rounded-full text-muted-foreground shadow-[inset_0_0_0_1px_var(--border)]">
        {priority}
      </span>
    </div>
  )
}

export default function BoardCard() {
  const [ada, sam, noor] = PEOPLE
  return (
    <div className="flex flex-wrap items-start gap-3">
      <Card
        id="MOB-15"
        title="Refine billing emails"
        priority={<Minus className="size-3.5" strokeWidth={1.75} />}
        assignees={<MemberAvatar member={ada} size={24} />}
      />
      <Card
        id="MOB-11"
        title="Instrument billing emails for the new plans"
        priority={
          <ChevronUp className="size-3.5 text-destructive" strokeWidth={1.75} />
        }
        assignees={<AvatarStack subjects={[sam, noor]} size={24} />}
      />
      <Card
        id="MOB-26"
        title="Camera permission prompt loops"
        priority={<Minus className="size-3.5" strokeWidth={1.75} />}
        assignees={
          <span className="grid size-6 place-items-center rounded-full text-muted-foreground shadow-[inset_0_0_0_1px_var(--border)] corner-squircle">
            <UserRound className="size-3.5" strokeWidth={1.75} />
          </span>
        }
      />
    </div>
  )
}
