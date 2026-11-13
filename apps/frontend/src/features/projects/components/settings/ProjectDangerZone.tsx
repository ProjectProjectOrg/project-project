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
  slug
}: {
  orgSlug: string
  slug: string
}) {
  const navigate = useNavigate()
  const remove = useAtomSet(deleteProject(projectRequest(orgSlug, slug)), {
    mode: "promiseExit"
  })

  return (
    <SettingsSection title={m.project_settings_danger_heading()}>
      <SettingsGroup>
        <SettingsRow
          label={m.project_settings_delete_heading()}
          description={m.project_settings_delete_description()}
        >
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
        </SettingsRow>
      </SettingsGroup>
    </SettingsSection>
  )
}
