import type { ActivitySystemSource, TicketActivityActor } from "@pp/shared"
import { Bot, GitBranch, Import, type LucideIcon } from "lucide-react"

import claudeLogo from "@/assets/logos/claude.svg"
import codexDarkLogo from "@/assets/logos/codex_dark.svg"
import codexLightLogo from "@/assets/logos/codex_light.svg"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { MemberAvatar } from "@/features/members/components/MemberAvatar"

const SYSTEM_ICONS: Readonly<Record<ActivitySystemSource, LucideIcon>> = {
  github: GitBranch,
  automation: Bot,
  import: Import
}

const AGENT_LOGOS = [
  { match: "claude", light: claudeLogo, dark: claudeLogo },
  { match: "codex", light: codexLightLogo, dark: codexDarkLogo },
  { match: "chatgpt", light: codexLightLogo, dark: codexDarkLogo },
  { match: "openai", light: codexLightLogo, dark: codexDarkLogo }
] as const

export const agentLogo = (actor: TicketActivityActor | null) =>
  actor?.kind === "agent"
    ? AGENT_LOGOS.find(({ match }) =>
        actor.client.name.toLowerCase().includes(match)
      )
    : undefined

export function ActorMark({
  actor
}: Readonly<{ actor: TicketActivityActor | null }>) {
  if (actor !== null && actor.kind !== "system") {
    const logo = agentLogo(actor)
    if (logo === undefined)
      return <MemberAvatar member={actor.user} size={20} />
    return (
      <Avatar aria-hidden className="size-5">
        <AvatarFallback>
          <img src={logo.light} alt="" className="size-3 dark:hidden" />
          <img src={logo.dark} alt="" className="hidden size-3 dark:block" />
        </AvatarFallback>
      </Avatar>
    )
  }
  const Icon = actor === null ? null : SYSTEM_ICONS[actor.source]
  return (
    <Avatar aria-hidden className="size-5">
      <AvatarFallback>
        {Icon && <Icon className="size-3" strokeWidth={2} />}
      </AvatarFallback>
    </Avatar>
  )
}
