import { useAtomValue } from "@effect/atom-react"
import { createFileRoute, Link } from "@tanstack/react-router"
import * as Result from "effect/unstable/reactivity/AsyncResult"

import {
  IntegrationDetail,
  IntegrationStatus
} from "@/components/settings/IntegrationDetail"
import { IntegrationLogo } from "@/components/settings/IntegrationLogo"
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
import { figmaProfileAtom } from "@/features/figma/atoms/figma"
import { m } from "@/paraglide/messages"

export const Route = createFileRoute(
  "/_authed/orgs/$orgSlug/settings/integrations/figma"
)({
  component: FigmaIntegrationPage,
  loader: () => ({
    crumb: { type: "static" as const, label: m.figma_project_title() }
  })
})

function FigmaIntegrationPage() {
  const { orgSlug } = Route.useParams()
  const storage = useStorageState(orgSlug)
  const state = perProjectState(true, storage)
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
              storage.connected
                ? m.org_integrations_figma_requires_ready()
                : m.org_integrations_figma_requires_missing()
            }
          >
            <Button
              variant="tertiary"
              size="sm"
              render={
                <Link
                  to="/orgs/$orgSlug/settings/integrations/storage"
                  params={{ orgSlug }}
                />
              }
            >
              {storage.connected
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
