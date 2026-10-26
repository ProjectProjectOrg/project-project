import { useAtomSet, useAtomValue } from "@effect/atom-react"
import { ORG_DELETE_GRACE_DAYS, type OrgDetail } from "@pp/shared"
import { getRouteApi, useNavigate } from "@tanstack/react-router"
import * as Exit from "effect/Exit"
import * as Result from "effect/reactivity/AsyncResult"

import { AsyncView } from "@/components/shell/AsyncView"
import {
  SettingsGroup,
  SettingsRow,
  SettingsSection
} from "@/components/shell/settings/SettingsSection"
import { SettingsSkeleton } from "@/components/shell/settings/SettingsSkeleton"
import { ConfirmButton } from "@/components/ui/confirm-button"
import { setActiveOrganization } from "@/features/auth/atoms/auth"
import {
  orgDetail,
  orgRequest,
  softDeleteOrg,
  userOrgs
} from "@/features/organizations/atoms/orgs"
import { nextActiveOrgSlug } from "@/features/organizations/lib/orgReflow"
import { useOrgActor } from "@/lib/access"
import { m } from "@/paraglide/messages"

const routeApi = getRouteApi("/_authed/orgs/$orgSlug/settings/danger")

export function OrgDangerSettings() {
  const { orgSlug } = routeApi.useParams()
  const result = useAtomValue(orgDetail(orgRequest(orgSlug)))
  const canDelete = useOrgActor(orgSlug).call("org", "softDelete")

  return (
    <AsyncView
      result={result}
      contained
      onInitial={() => <SettingsSkeleton rows={2} />}
      onSuccess={({ value }) =>
        canDelete ? (
          <DeleteCard orgSlug={orgSlug} org={value} />
        ) : (
          <SettingsSection>
            <SettingsGroup>
              <SettingsRow
                label={m.org_danger_delete_heading()}
                description={m.org_danger_owner_only()}
              />
            </SettingsGroup>
          </SettingsSection>
        )
      }
    />
  )
}

function DeleteCard({ orgSlug, org }: { orgSlug: string; org: OrgDetail }) {
  const navigate = useNavigate()
  const req = orgRequest(orgSlug)
  const softDelete = useAtomSet(softDeleteOrg(req), { mode: "promiseExit" })
  const deleteState = useAtomValue(softDeleteOrg(req))
  const setActive = useAtomSet(setActiveOrganization, {
    mode: "promiseExit"
  })
  const orgsResult = useAtomValue(userOrgs())

  async function onDelete() {
    const exit = await softDelete()
    if (!Exit.isSuccess(exit)) return exit

    const orgs = Result.isSuccess(orgsResult) ? orgsResult.value : []
    const nextSlug = nextActiveOrgSlug(orgs, orgSlug)
    if (nextSlug) {
      await setActive(nextSlug)
      await navigate({ to: "/orgs/$orgSlug", params: { orgSlug: nextSlug } })
    } else {
      await navigate({ to: "/welcome" })
    }
    return exit
  }

  return (
    <SettingsSection>
      <SettingsGroup>
        <SettingsRow
          layout="stacked"
          label={m.org_danger_delete_heading()}
          description={m.org_danger_delete_description({
            days: ORG_DELETE_GRACE_DAYS
          })}
        >
          <ConfirmButton.Root className="w-full">
            <ConfirmButton.Trigger variant="destructive" size="sm">
              {m.org_danger_delete_button()}
            </ConfirmButton.Trigger>
            <ConfirmButton.Confirm className="w-full">
              <ConfirmButton.Action
                layout="stacked"
                prompt={m.org_danger_delete_confirm_label({ slug: org.slug })}
                typed={org.slug}
                label={m.org_danger_delete_button()}
                busyLabel={m.org_danger_delete_in_progress()}
                waiting={deleteState.waiting}
                error={
                  Result.isFailure(deleteState)
                    ? m.org_danger_delete_error()
                    : null
                }
                onConfirm={onDelete}
              />
            </ConfirmButton.Confirm>
          </ConfirmButton.Root>
        </SettingsRow>
      </SettingsGroup>
    </SettingsSection>
  )
}
