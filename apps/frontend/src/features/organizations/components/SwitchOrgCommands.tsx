import { useAtomValue } from "@effect/atom-react"
import * as Result from "effect/reactivity/AsyncResult"
import { Building2 } from "lucide-react"

import { CommandMenuItem, CommandMenuCheck } from "@/components/ui/command-menu"
import { setActiveOrganization } from "@/features/auth/atoms/auth"
import { CommandFrame } from "@/features/command-menu/components/CommandFrame"
import type { CommandPageProps } from "@/features/command-menu/lib/commandPages"
import { userOrgs } from "@/features/organizations/atoms/orgs"
import { m } from "@/paraglide/messages"

export function SwitchOrgCommands({
  context,
  chip,
  onBack,
  env
}: CommandPageProps) {
  const result = useAtomValue(userOrgs())
  const orgs = Result.isSuccess(result) ? result.value : []
  return (
    <CommandFrame
      chip={chip}
      placeholder={m.chrome_command_menu_switch_org_placeholder()}
      onBack={onBack}
      items={orgs
        .toSorted((a, b) => a.name.localeCompare(b.name))
        .map((org) => ({ value: org.slug, label: org.name, icon: Building2 }))}
      onSelect={(item) => {
        if (item.value !== context.orgSlug) {
          env.execute(setActiveOrganization, item.value)
          env.navigate(`/orgs/${item.value}`)
        }
        env.close()
      }}
      renderItem={(item) => (
        <CommandMenuItem value={item.value}>
          <span className="min-w-0 flex-1 truncate">{item.label}</span>
          {context.orgSlug === item.value && <CommandMenuCheck />}
        </CommandMenuItem>
      )}
    />
  )
}
