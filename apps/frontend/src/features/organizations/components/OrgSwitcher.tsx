import { useAtomSet, useAtomValue } from "@effect/atom-react"
import type { Org } from "@pp/shared"
import { useNavigate, useParams } from "@tanstack/react-router"
import * as Result from "effect/reactivity/AsyncResult"
import { ChevronsUpDown, Plus } from "lucide-react"

import { Select, SelectTrigger } from "@/components/ui/select"
import { me, setActiveOrganization } from "@/features/auth/atoms/auth"
import { userOrgs } from "@/features/organizations/atoms/orgs"
import { m } from "@/paraglide/messages"

const CREATE_ORG = "__create-org"

export function OrgSwitcher() {
  const orgsResult = useAtomValue(userOrgs())
  const viewer = useAtomValue(me())
  const params = useParams({ strict: false }) as { orgSlug?: string }
  const setActive = useAtomSet(setActiveOrganization)
  const navigate = useNavigate()

  if (!Result.isSuccess(orgsResult)) return null
  const orgs = orgsResult.value
  if (orgs.length <= 1) return null

  const activeSlug =
    params.orgSlug ??
    (Result.isSuccess(viewer) ? viewer.value.activeOrgSlug : null) ??
    null

  const sorted = [...orgs].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
  )
  const current = sorted.find((o) => o.slug === activeSlug) ?? sorted[0]

  const switchTo = (org: Org) => {
    if (org.slug === current.slug) return
    setActive(org.slug)
    void navigate({ to: "/orgs/$orgSlug", params: { orgSlug: org.slug } })
  }

  const items = [
    ...sorted.map((org, index) => ({
      value: org.slug,
      textValue: org.name,
      separated: index === sorted.length - 1,
      label: <span className="min-w-0 flex-1 truncate">{org.name}</span>
    })),
    {
      value: CREATE_ORG,
      textValue: m.org_switcher_create_new(),
      label: (
        <>
          <Plus className="size-4" strokeWidth={1.75} />
          {m.org_switcher_create_new()}
        </>
      ),
      onAction: () => void navigate({ to: "/welcome" })
    }
  ]

  return (
    <Select
      items={items}
      value={current.slug}
      onValueChange={(slug) => {
        const org = sorted.find((candidate) => candidate.slug === slug)
        if (org) switchTo(org)
      }}
      contentProps={{ align: "end", className: "w-56" }}
    >
      <SelectTrigger
        render={
          <button
            type="button"
            aria-label={m.org_switcher_trigger_aria_label()}
            className="ml-auto flex min-w-0 items-center gap-1.5 rounded-md px-2 py-1 text-sm text-muted-foreground transition-all duration-100 outline-none hover:bg-hover hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.97]"
          />
        }
      >
        <span className="min-w-0 truncate">{current.name}</span>
        <ChevronsUpDown
          className="size-3.5 shrink-0 opacity-60"
          strokeWidth={1.75}
        />
      </SelectTrigger>
    </Select>
  )
}
