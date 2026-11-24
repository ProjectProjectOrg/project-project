import { useAtomValue } from "@effect/atom-react"
import { Megaphone } from "@pp/ui/icons"
import { SidebarRailItem } from "@pp/ui/sidebar"
import { Link } from "@tanstack/react-router"
import * as AsyncResult from "effect/reactivity/AsyncResult"

import { m } from "@/paraglide/messages"

import { instanceChangelog } from "../atoms/instance"
import { useWhatsNewSeen } from "../hooks/useWhatsNewSeen"
import { hasUnseen } from "../lib/whatsNew"

export function WhatsNewRailItem({ active }: Readonly<{ active: boolean }>) {
  const changelog = useAtomValue(instanceChangelog)
  const { lastSeen } = useWhatsNewSeen()
  const unseen =
    !active &&
    AsyncResult.isSuccess(changelog) &&
    hasUnseen(changelog.value.entries, lastSeen)
  return (
    <SidebarRailItem
      label={unseen ? m.chrome_whats_new_unread() : m.chrome_whats_new_title()}
      tooltip={m.chrome_whats_new_title()}
      active={active}
      render={<Link to="/changelog" />}
    >
      <span className="relative grid place-items-center">
        <Megaphone className="size-[18px]" />
        {unseen ? (
          <span
            aria-hidden
            className="absolute -top-0.5 -right-0.5 size-[7px] rounded-full bg-foreground ring-2 ring-background"
          />
        ) : null}
      </span>
    </SidebarRailItem>
  )
}
