import { useAtomSet } from "@effect/atom-react"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import * as Exit from "effect/Exit"

import {
  SettingsGroup,
  SettingsRow,
  SettingsSection
} from "@/components/settings/SettingsSection"
import { ConfirmButton } from "@/components/ui/confirm-button"
import {
  deleteProject,
  projectRequest
} from "@/features/projects/atoms/projects"
import { useProjectActor } from "@/lib/access"
import { m } from "@/paraglide/messages"

import { useProject } from "../-context"

export const Route = createFileRoute(
  "/_authed/orgs/$orgSlug/projects/$slug/settings/danger"
)({
  component: DangerSettings,
  loader: () => ({
    crumb: { type: "static" as const, label: m.project_settings_danger_tab() }
  })
})

function DangerSettings() {
  const { orgSlug } = Route.useParams()
  const project = useProject()
  const navigate = useNavigate()
  const canDelete = useProjectActor().call("projects", "delete")
  const remove = useAtomSet(
    deleteProject(projectRequest(orgSlug, project.slug)),
    { mode: "promiseExit" }
  )

  return (
    <SettingsSection>
      <SettingsGroup>
        <SettingsRow
          label={m.project_settings_delete_heading()}
          description={m.project_settings_delete_description()}
        >
          {canDelete ? (
            <ConfirmButton.Root>
              <ConfirmButton.Trigger variant="tertiary" size="sm">
                {m.project_detail_delete_button()}
              </ConfirmButton.Trigger>
              <ConfirmButton.Confirm>
                <ConfirmButton.Action
                  prompt={m.project_settings_delete_confirm_prompt()}
                  label={m.project_detail_delete_button()}
                  busyLabel={m.project_detail_delete_in_progress()}
                  describeError={() => m.project_settings_delete_error()}
                  onConfirm={async () => {
                    const exit = await remove()
                    if (Exit.isSuccess(exit)) {
                      void navigate({
                        to: "/orgs/$orgSlug/projects",
                        params: { orgSlug }
                      })
                    }
                    return exit
                  }}
                />
              </ConfirmButton.Confirm>
            </ConfirmButton.Root>
          ) : (
            <span className="text-[13px] text-muted-foreground">
              {m.project_settings_delete_forbidden()}
            </span>
          )}
        </SettingsRow>
      </SettingsGroup>
    </SettingsSection>
  )
}
