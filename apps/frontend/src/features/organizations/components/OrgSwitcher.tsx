import { useAtomSet, useAtomValue } from "@effect/atom-react"
import type { Org } from "@pp/shared"
import { Plus } from "@pp/ui/icons"
import { Select, SelectTrigger } from "@pp/ui/select"
import { useNavigate, useParams } from "@tanstack/react-router"
import * as Result from "effect/reactivity/AsyncResult"
import type { ReactElement } from "react"

import { me, setActiveOrganization } from "@/features/auth/atoms/auth"
import { userOrgs } from "@/features/organizations/atoms/orgs"
import { m } from "@/paraglide/messages"

const CREATE_ORG = "__create-org"

export function OrgSwitcher({ trigger }: Readonly<{ trigger: ReactElement }>) {
  const orgsResult = useAtomValue(userOrgs())
  const viewer = useAtomValue(me())
  const params = useParams({ strict: false })
  const setActive = useAtomSet(setActiveOrganization)
  const navigate = useNavigate()

  if (!Result.isSuccess(orgsResult) || orgsResult.value.length === 0)
    return trigger
  const orgs = orgsResult.value

  const activeSlug =
    params.orgSlug ??
    (Result.isSuccess(viewer) ? viewer.value.activeOrgSlug : null) ??
    null

  const sorted = orgs.toSorted((a, b) =>
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
      contentProps={{
        side: "right",
        align: "start",
        sideOffset: 10,
        className: "w-56"
      }}
    >
      <SelectTrigger render={trigger} />
    </Select>
  )
}
