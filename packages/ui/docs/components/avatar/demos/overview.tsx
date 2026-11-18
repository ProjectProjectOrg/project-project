import { Avatar, AvatarFallback } from "@pp/ui/avatar"
import { Bot } from "@pp/ui/icons"
import { AvatarStack, MemberAvatar } from "@pp/ui/member-avatar"
import type { ReactNode } from "react"

import { PEOPLE } from "./people"

const SIZES = [16, 20, 24, 32, 40, 64] as const

function Row({
  caption,
  children
}: Readonly<{ caption: string; children: ReactNode }>) {
  return (
    <div className="grid grid-cols-[8rem_1fr] items-center gap-6">
      <span className="text-caption text-muted-foreground">{caption}</span>
      <div className="flex flex-wrap items-center gap-4">{children}</div>
    </div>
  )
}

export default function Overview() {
  const [ada, sam, noor, wouter] = PEOPLE
  return (
    <div className="grid w-full max-w-xl gap-6">
      <Row caption="Sizes">
        {SIZES.map((size) => (
          <MemberAvatar
            key={size}
            member={ada}
            size={size}
            label={`${ada.name}, ${size}px`}
          />
        ))}
      </Row>
      <Row caption="Seeds">
        {[ada, sam, noor, wouter].map((person) => (
          <MemberAvatar
            key={person.id}
            member={person}
            size={40}
            label={person.name}
          />
        ))}
      </Row>
      <Row caption="Stacks">
        <AvatarStack subjects={PEOPLE.slice(0, 3)} size={20} />
        <AvatarStack subjects={PEOPLE.slice(0, 4)} size={24} />
        <AvatarStack subjects={PEOPLE} size={32} max={4} />
      </Row>
      <Row caption="Icon fallback">
        <Avatar aria-hidden className="size-5">
          <AvatarFallback>
            <Bot className="size-3" strokeWidth={2} />
          </AvatarFallback>
        </Avatar>
        <Avatar aria-hidden>
          <AvatarFallback>
            <Bot className="size-4" strokeWidth={2} />
          </AvatarFallback>
        </Avatar>
      </Row>
    </div>
  )
}
