import { useAtomValue } from "@effect/atom-react"
import { createFileRoute, Link } from "@tanstack/react-router"
import * as Result from "effect/unstable/reactivity/AsyncResult"

import {
  IntegrationDetail,
  IntegrationStatus
} from "@/components/settings/IntegrationDetail"
import { IntegrationProjects } from "@/components/settings/IntegrationProjects"
import {
  perProjectState,
  useStorageState
} from "@/components/settings/orgIntegrations"
import {
  SettingsGroup,
  SettingsRow,
  SettingsSection
} from "@/components/settings/SettingsSection"
import { Button } from "@/components/ui/button"
import { me } from "@/features/auth/atoms/auth"
import { m } from "@/paraglide/messages"

export const Route = createFileRoute(
  "/_authed/orgs/$orgSlug/settings/integrations/everhour"
)({
  component: EverhourIntegrationPage,
  loader: () => ({
    crumb: {
      type: "static" as const,
      label: m.project_settings_everhour_heading()
    }
  })
})

function EverhourIntegrationPage() {
  const { orgSlug } = Route.useParams()
  const viewer = useAtomValue(me())
  const personal = Result.isSuccess(viewer)
    ? viewer.value.personalEverhour.connected
    : false
  const state = perProjectState(false, useStorageState(orgSlug))

  return (
    <IntegrationDetail
      orgSlug={orgSlug}
      kind="everhour"
      name={m.project_settings_everhour_heading()}
      description={m.org_integrations_everhour_card()}
      about={m.org_integrations_everhour_about()}
      meta={[
        {
          label: m.org_integrations_meta_status(),
          value: <IntegrationStatus tone={state.tone} label={state.label} />
        },
        {
          label: m.org_integrations_meta_category(),
          value: m.org_integrations_category_time()
        },
        {
          label: m.org_integrations_meta_scope(),
          value: m.org_integrations_scope_project()
        }
      ]}
    >
      <SettingsSection>
        <SettingsGroup>
          <SettingsRow
            label={m.org_integrations_everhour_personal_label()}
            description={
              personal
                ? m.org_integrations_personal_connected()
                : m.org_integrations_personal_not_connected()
            }
          >
            <Button
              variant="tertiary"
              size="sm"
              render={<Link to="/profile/connections" />}
            >
              {m.org_integrations_personal_button()}
            </Button>
          </SettingsRow>
        </SettingsGroup>
      </SettingsSection>
      <IntegrationProjects orgSlug={orgSlug} />
    </IntegrationDetail>
  )
}
