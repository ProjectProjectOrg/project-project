import type { TicketActivityActor } from "@pp/shared"
import claudeLogo from "@pp/ui/assets/logos/claude.svg"
import codexDarkLogo from "@pp/ui/assets/logos/codex_dark.svg"
import codexLightLogo from "@pp/ui/assets/logos/codex_light.svg"
import githubDarkLogo from "@pp/ui/assets/logos/github_dark.svg"
import githubLightLogo from "@pp/ui/assets/logos/github_light.svg"
import { Avatar, AvatarFallback } from "@pp/ui/avatar"
import { Bot, Import } from "@pp/ui/icons"
import { MemberAvatar } from "@pp/ui/member-avatar"

const SIZE = 28

const AGENT_LOGOS = [
  { match: "claude", light: claudeLogo, dark: claudeLogo },
  { match: "codex", light: codexLightLogo, dark: codexDarkLogo },
  { match: "chatgpt", light: codexLightLogo, dark: codexDarkLogo },
  { match: "openai", light: codexLightLogo, dark: codexDarkLogo }
] as const

function LogoMark({ light, dark }: Readonly<{ light: string; dark: string }>) {
  return (
    <Avatar aria-hidden className="size-7">
      <AvatarFallback>
        <img src={light} alt="" className="size-4 dark:hidden" />
        <img src={dark} alt="" className="hidden size-4 dark:block" />
      </AvatarFallback>
    </Avatar>
  )
}

export function InboxActorMark({
  actor
}: Readonly<{ actor: TicketActivityActor | null }>) {
  if (actor === null)
    return (
      <Avatar aria-hidden className="size-7">
        <AvatarFallback />
      </Avatar>
    )
  if (actor.kind === "imported")
    return (
      <MemberAvatar
        member={{ id: actor.sourceId, name: actor.displayName }}
        size={SIZE}
      />
    )
  if (actor.kind === "system") {
    if (actor.source === "github")
      return <LogoMark light={githubLightLogo} dark={githubDarkLogo} />
    const Icon = actor.source === "import" ? Import : Bot
    return (
      <Avatar aria-hidden className="size-7">
        <AvatarFallback>
          <Icon className="size-3.5" strokeWidth={2} />
        </AvatarFallback>
      </Avatar>
    )
  }
  if (actor.kind === "agent") {
    const name = actor.client.name.toLowerCase()
    const logo = AGENT_LOGOS.find(({ match }) => name.includes(match))
    if (logo !== undefined) return <LogoMark {...logo} />
  }
  return <MemberAvatar member={actor.user} size={SIZE} />
}
