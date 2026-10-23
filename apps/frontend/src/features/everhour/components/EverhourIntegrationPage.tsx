import { useAtomValue } from "@effect/atom-react"
import { getRouteApi, Link } from "@tanstack/react-router"
import * as Result from "effect/reactivity/AsyncResult"

import {
  SettingsGroup,
  SettingsRow,
  SettingsSection
} from "@/components/shell/settings/SettingsSection"
import { Button } from "@/components/ui/button"
import { me } from "@/features/auth/atoms/auth"
import {
  IntegrationDetail,
  IntegrationStatus
} from "@/features/integrations/components/IntegrationDetail"
import { IntegrationProjects } from "@/features/integrations/components/IntegrationProjects"
import {
  perProjectState,
  useStorageState
} from "@/features/integrations/hooks/useOrgIntegrations"
import { m } from "@/paraglide/messages"

const routeApi = getRouteApi(
  "/_authed/orgs/$orgSlug/settings/integrations/everhour"
)

export function EverhourIntegrationPage() {
  const { orgSlug } = routeApi.useParams()
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
