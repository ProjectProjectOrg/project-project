import * as Match from "effect/Match"
import { HardDrive, Mail, Timer, type LucideIcon } from "lucide-react"

import figmaLogo from "@/assets/logos/figma.svg"
import githubDarkLogo from "@/assets/logos/github_dark.svg"
import githubLightLogo from "@/assets/logos/github_light.svg"
import slackLogo from "@/assets/logos/slack.svg"
import { cn } from "@/lib/utils"

export type IntegrationKind =
  | "github"
  | "everhour"
  | "figma"
  | "storage"
  | "email"
  | "slack"

const ICONS: Readonly<Partial<Record<IntegrationKind, LucideIcon>>> = {
  everhour: Timer,
  storage: HardDrive,
  email: Mail
}

export function IntegrationLogo({
  kind,
  size = "md",
  className
}: Readonly<{
  kind: IntegrationKind
  size?: "sm" | "md" | "lg"
  className?: string
}>) {
  return (
    <span
      aria-hidden
      data-size={size}
      className={cn(
        "group/logo grid size-8 shrink-0 place-items-center rounded-[10px] border border-border bg-background text-foreground data-[size=lg]:size-12 data-[size=lg]:rounded-[14px] data-[size=sm]:size-4 data-[size=sm]:rounded-none data-[size=sm]:border-0 data-[size=sm]:bg-transparent [&_img]:size-4 data-[size=lg]:[&_img]:size-6 [&_svg]:size-4 data-[size=lg]:[&_svg]:size-6",
        className
      )}
    >
      {Match.value(kind).pipe(
        Match.when("github", () => (
          <>
            <img src={githubLightLogo} alt="" className="dark:hidden" />
            <img src={githubDarkLogo} alt="" className="hidden dark:block" />
          </>
        )),
        Match.when("figma", () => (
          <img src={figmaLogo} alt="" className="object-contain" />
        )),
        Match.when("slack", () => (
          <img src={slackLogo} alt="" className="object-contain" />
        )),
        Match.orElse((kind) => <IconTile kind={kind} />)
      )}
    </span>
  )
}

function IconTile({ kind }: Readonly<{ kind: IntegrationKind }>) {
  const Icon = ICONS[kind] ?? Timer
  return <Icon strokeWidth={1.75} />
}
