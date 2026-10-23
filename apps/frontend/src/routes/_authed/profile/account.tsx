import { createFileRoute } from "@tanstack/react-router"

import { Account } from "@/features/profile/components/Account"
import { m } from "@/paraglide/messages"

export const Route = createFileRoute("/_authed/profile/account")({
  component: Account,
  loader: () => ({
    crumb: { type: "static" as const, label: m.profile_section_account_title() }
  })
})
