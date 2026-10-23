import { useAtomSet, useAtomValue } from "@effect/atom-react"
import { ORG_DELETE_GRACE_DAYS, type OrgDetail } from "@pp/shared"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import * as Exit from "effect/Exit"
import * as Result from "effect/reactivity/AsyncResult"
import { useState, type FormEvent } from "react"

import { ErrorPage } from "@/components/shell/ErrorPage"
import {
  SettingsGroup,
  SettingsRow,
  SettingsSection
} from "@/components/shell/settings/SettingsSection"
import { SettingsSkeleton } from "@/components/shell/settings/SettingsSkeleton"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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

export const Route = createFileRoute("/_authed/orgs/$orgSlug/settings/danger")({
  component: DangerSettings,
  loader: () => ({
    crumb: { type: "static" as const, label: m.org_settings_danger_tab() }
  })
})

function DangerSettings() {
  const { orgSlug } = Route.useParams()
  const result = useAtomValue(orgDetail(orgRequest(orgSlug)))
  const canDelete = useOrgActor(orgSlug).call("org", "softDelete")

  return Result.matchWithError(result, {
    onInitial: () => <SettingsSkeleton rows={2} />,
    onError: (error) => <ErrorPage error={error} contained />,
    onDefect: (defect) => <ErrorPage error={defect} contained />,
    onSuccess: ({ value }) =>
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
  })
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
  const [confirm, setConfirm] = useState("")

  const submitting = deleteState.waiting
  const error = Result.isFailure(deleteState)
    ? m.org_danger_delete_error()
    : null
  const canDelete = confirm.trim() === org.slug && !submitting

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (!canDelete) return
    const exit = await softDelete()
    if (!Exit.isSuccess(exit)) return

    const orgs = Result.isSuccess(orgsResult) ? orgsResult.value : []
    const nextSlug = nextActiveOrgSlug(orgs, orgSlug)
    if (nextSlug) {
      await setActive(nextSlug)
      await navigate({ to: "/orgs/$orgSlug", params: { orgSlug: nextSlug } })
    } else {
      await navigate({ to: "/welcome" })
    }
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
          error={error}
        >
          <form onSubmit={onSubmit} className="flex w-full flex-col gap-2">
            <label
              htmlFor="org-delete-confirm"
              className="text-xs text-muted-foreground"
            >
              {m.org_danger_delete_confirm_label({ slug: org.slug })}
            </label>
            <div className="flex items-center gap-2">
              <Input
                id="org-delete-confirm"
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
                disabled={submitting}
                placeholder={org.slug}
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                className="w-64 font-mono"
              />
              <Button
                type="submit"
                variant="destructive"
                size="sm"
                disabled={!canDelete}
              >
                {submitting
                  ? m.org_danger_delete_in_progress()
                  : m.org_danger_delete_button()}
              </Button>
            </div>
          </form>
        </SettingsRow>
      </SettingsGroup>
    </SettingsSection>
  )
}
