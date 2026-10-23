import { useAtomSet, useAtomValue } from "@effect/atom-react"
import { createFileRoute } from "@tanstack/react-router"

import {
  SettingsGroup,
  SettingsRow,
  SettingsSection
} from "@/components/shell/settings/SettingsSection"
import { Button } from "@/components/ui/button"
import { MembersSection } from "@/features/members/components/MembersSection"
import {
  project,
  projectRequest,
  updateProjectSetup
} from "@/features/projects/atoms/projects"
import { useProject } from "@/features/projects/hooks/useProject"
import { useProjectActor } from "@/lib/access"
import { m } from "@/paraglide/messages"

export const Route = createFileRoute(
  "/_authed/orgs/$orgSlug/projects/$slug/settings/team"
)({
  component: TeamSettings,
  loader: () => ({
    crumb: { type: "static" as const, label: m.project_settings_team_tab() }
  })
})

function TeamSettings() {
  const { orgSlug } = Route.useParams()
  const projectDetail = useProject()
  const req = projectRequest(orgSlug, projectDetail.slug)
  const projectResult = useAtomValue(project(req))
  const setup = useAtomSet(updateProjectSetup(req))
  const actor = useProjectActor()

  return (
    <>
      <SettingsSection>
        <MembersSection
          orgSlug={orgSlug}
          slug={projectDetail.slug}
          members={projectDetail.members}
          pendingMembers={projectDetail.pendingMembers}
          waiting={projectResult.waiting}
          canManage={actor.call("projects", "addMember")}
          callerId={actor.userId}
        />
      </SettingsSection>
      {projectDetail.setup.invitePeopleDismissedAt &&
      actor.call("projects", "updateSetup") ? (
        <SettingsSection>
          <SettingsGroup>
            <SettingsRow label={m.project_setup_invite_dismissed_note()}>
              <Button
                variant="tertiary"
                size="sm"
                onClick={() => setup({ invitePeopleDismissedAt: null })}
              >
                {m.project_setup_restore_button()}
              </Button>
            </SettingsRow>
          </SettingsGroup>
        </SettingsSection>
      ) : null}
    </>
  )
}
