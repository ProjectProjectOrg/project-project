import { useAtomValue } from "@effect/atom-react"
import type { OrgDetail } from "@pp/shared"
import { createFileRoute } from "@tanstack/react-router"
import * as Result from "effect/unstable/reactivity/AsyncResult"

import { ErrorPage } from "@/components/ErrorPage"
import { OrgMembersSection } from "@/components/OrgMembersSection"
import { SettingsSection } from "@/components/settings/SettingsSection"
import { SettingsSkeleton } from "@/components/settings/SettingsSkeleton"
import { me } from "@/features/auth/atoms/auth"
import {
  orgDetail,
  orgMembers,
  orgRequest
} from "@/features/organizations/atoms/orgs"
import { m } from "@/paraglide/messages"

export const Route = createFileRoute("/_authed/orgs/$orgSlug/settings/members")(
  {
    component: MembersSettings,
    loader: ({ context: { registry }, params: { orgSlug } }) => {
      registry.mount(orgMembers(orgRequest(orgSlug)))()
      return {
        crumb: { type: "static" as const, label: m.org_settings_members_tab() }
      }
    }
  }
)

function MembersSettings() {
  const { orgSlug } = Route.useParams()
  const detail = useAtomValue(orgDetail(orgRequest(orgSlug)))

  return Result.matchWithError(detail, {
    onInitial: () => <MembersSkeleton />,
    onError: (error) => <ErrorPage error={error} contained />,
    onDefect: (defect) => <ErrorPage error={defect} contained />,
    onSuccess: ({ value }) => <MembersBody orgSlug={orgSlug} org={value} />
  })
}

function MembersBody({ orgSlug, org }: { orgSlug: string; org: OrgDetail }) {
  const membersResult = useAtomValue(orgMembers(orgRequest(orgSlug)))
  const viewer = useAtomValue(me())

  return Result.matchWithError(viewer, {
    onInitial: () => <MembersSkeleton />,
    onError: (error) => <ErrorPage error={error} contained />,
    onDefect: (defect) => <ErrorPage error={defect} contained />,
    onSuccess: ({ value: currentUser }) =>
      Result.matchWithError(membersResult, {
        onInitial: () => <MembersSkeleton />,
        onError: (error) => <ErrorPage error={error} contained />,
        onDefect: (defect) => <ErrorPage error={defect} contained />,
        onSuccess: ({ value }) => (
          <SettingsSection>
            <OrgMembersSection
              orgSlug={orgSlug}
              orgName={org.name}
              members={value.members}
              invitations={value.invitations}
              callerRole={org.role}
              callerUserId={currentUser.id}
            />
          </SettingsSection>
        )
      })
  })
}

function MembersSkeleton() {
  return (
    <SettingsSection>
      <div className="h-10 w-full animate-pulse rounded-xl bg-muted" />
      <SettingsSkeleton rows={3} />
    </SettingsSection>
  )
}
