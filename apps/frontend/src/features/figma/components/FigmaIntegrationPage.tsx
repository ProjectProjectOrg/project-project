import { useAtomValue } from "@effect/atom-react"
import { Button } from "@pp/ui/button"
import { getRouteApi, Link } from "@tanstack/react-router"
import * as Result from "effect/reactivity/AsyncResult"

import { SettingsGroup } from "@/components/shell/settings/SettingsGroup"
import {
  SettingsRow,
  SettingsSection
} from "@/components/shell/settings/SettingsSection"
import { figmaProfileAtom } from "@/features/figma/atoms/figma"
import {
  IntegrationDetail,
  IntegrationStatus
} from "@/features/integrations/components/IntegrationDetail"
import { IntegrationLogo } from "@/features/integrations/components/IntegrationLogo"
import { IntegrationProjects } from "@/features/integrations/components/IntegrationProjects"
import {
  IntegrationState,
  perProjectState,
  useStorageState
} from "@/features/integrations/hooks/useOrgIntegrations"
import { m } from "@/paraglide/messages"

const routeApi = getRouteApi(
  "/_authed/settings/orgs/$orgSlug/integrations/figma"
)

export function FigmaIntegrationPage() {
  const { orgSlug } = routeApi.useParams()
  const storage = useStorageState(orgSlug)
  const state = perProjectState(true, storage)
  const storageReady =
    IntegrationState.$is("connected")(storage) ||
    IntegrationState.$is("attention")(storage)
  const profile = useAtomValue(figmaProfileAtom)
  const personal = Result.isSuccess(profile) ? profile.value.connected : false

  return (
    <IntegrationDetail
      orgSlug={orgSlug}
      kind="figma"
      name={m.figma_project_title()}
      description={m.org_integrations_figma_card()}
      about={m.org_integrations_figma_about()}
      meta={[
        {
          label: m.org_integrations_meta_status(),
          value: <IntegrationStatus tone={state.tone} label={state.label} />
        },
        {
          label: m.org_integrations_meta_category(),
          value: m.org_integrations_category_design()
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
            icon={<IntegrationLogo kind="storage" />}
            label={m.org_integrations_figma_requires_label()}
            description={
              storageReady
                ? m.org_integrations_figma_requires_ready()
                : m.org_integrations_figma_requires_missing()
            }
          >
            <Button
              variant="tertiary"
              size="sm"
              render={
                <Link
                  to="/settings/orgs/$orgSlug/integrations/storage"
                  params={{ orgSlug }}
                />
              }
            >
              {storageReady
                ? m.org_integrations_manage_button()
                : m.org_integrations_set_up_button()}
            </Button>
          </SettingsRow>
          <SettingsRow
            icon={<IntegrationLogo kind="figma" />}
            label={m.org_integrations_figma_personal_label()}
            description={
              personal
                ? m.org_integrations_personal_connected()
                : m.org_integrations_personal_not_connected()
            }
          >
            <Button
              variant="tertiary"
              size="sm"
              render={<Link to="/settings/profile/connections" />}
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
