import { useAtomSet } from "@effect/atom-react"
import { useNavigate } from "@tanstack/react-router"
import * as Exit from "effect/Exit"

import {
  SettingsGroup,
  SettingsRow,
  SettingsSection
} from "@/components/shell/settings/SettingsSection"
import { ConfirmButton } from "@/components/ui/confirm-button"
import {
  deleteProject,
  projectRequest
} from "@/features/projects/atoms/projects"
import { m } from "@/paraglide/messages"

export function ProjectDangerZone({
  orgSlug,
  slug,
  projectKey
}: {
  orgSlug: string
  slug: string
  projectKey: string
}) {
  const navigate = useNavigate()
  const remove = useAtomSet(deleteProject(projectRequest(orgSlug, slug)), {
    mode: "promiseExit"
  })

  return (
    <SettingsSection title={m.project_settings_danger_heading()}>
      <SettingsGroup>
        <SettingsRow
          layout="stacked"
          label={m.project_settings_delete_heading()}
          description={m.project_settings_delete_description()}
        >
          <ConfirmButton.Root className="w-full">
            <ConfirmButton.Trigger variant="destructive" size="sm">
              {m.project_detail_delete_button()}
            </ConfirmButton.Trigger>
            <ConfirmButton.Confirm className="w-full">
              <ConfirmButton.Action
                layout="stacked"
                prompt={m.project_settings_delete_confirm_prompt({
                  key: projectKey
                })}
                typed={projectKey}
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
        </SettingsRow>
      </SettingsGroup>
    </SettingsSection>
  )
}
