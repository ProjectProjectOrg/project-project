import { useAtomSet, useAtomValue } from "@effect/atom-react"
import { createFileRoute } from "@tanstack/react-router"

import { MembersSection } from "@/components/MembersSection"
import { Button } from "@/components/ui/button"
import {
  project,
  projectRequest,
  updateProjectSetup
} from "@/features/projects/atoms/projects"
import { useProjectActor } from "@/lib/access"
import { m } from "@/paraglide/messages"

import { useProject } from "../-context"

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
    <section className="flex w-full flex-col gap-4">
      <MembersSection
        orgSlug={orgSlug}
        slug={projectDetail.slug}
        members={projectDetail.members}
        pendingMembers={projectDetail.pendingMembers}
        waiting={projectResult.waiting}
        canManage={actor.call("projects", "addMember")}
        callerId={actor.userId}
      />
      {projectDetail.setup.invitePeopleDismissedAt &&
      actor.call("projects", "updateSetup") ? (
        <div className="flex items-center justify-between rounded-lg border border-border bg-background px-3 py-2">
          <span className="text-sm text-muted-foreground">
            {m.project_setup_invite_dismissed_note()}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setup({ invitePeopleDismissedAt: null })}
          >
            {m.project_setup_restore_button()}
          </Button>
        </div>
      ) : null}
    </section>
  )
}
