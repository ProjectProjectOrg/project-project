import { useAtomSet, useAtomValue } from "@effect/atom-react"
import type { SlackProfile } from "@pp/shared"

import { AsyncView } from "@/components/shell/AsyncView"
import { SettingsRow } from "@/components/shell/settings/SettingsSection"
import { Button } from "@/components/ui/button"
import { IntegrationLogo } from "@/features/integrations/components/IntegrationLogo"
import { mutationErrorText, slackActionErrorMessage } from "@/lib/mutationError"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

import {
  disconnectSlackProfile,
  slackOrgRequest,
  slackProfiles
} from "../atoms/slack"

export function SlackProfileSettings({
  oauthError
}: Readonly<{ oauthError: string | null }>) {
  const result = useAtomValue(slackProfiles({}))
  return (
    <AsyncView
      result={result}
      contained
      onInitial={() => (
        <SettingsRow
          icon={<IntegrationLogo kind="slack" />}
          label={m.slack_profile_title()}
          description={
            <span className="block h-3 w-40 animate-pulse rounded bg-muted" />
          }
        />
      )}
      onSuccess={({ value }) =>
        value.length ? (
          value.map((profile) => (
            <ProfileRow
              key={profile.orgSlug}
              profile={profile}
              oauthError={oauthError}
            />
          ))
        ) : (
          <SettingsRow
            icon={<IntegrationLogo kind="slack" />}
            label={m.slack_profile_title()}
            description={m.slack_profile_empty()}
            error={oauthError}
          />
        )
      }
    />
  )
}

function ProfileRow({
  profile,
  oauthError
}: Readonly<{ profile: SlackProfile; oauthError: string | null }>) {
  const req = slackOrgRequest(profile.orgSlug)
  const disconnect = useAtomSet(disconnectSlackProfile(req))
  const state = useAtomValue(disconnectSlackProfile(req))
  return (
    <SettingsRow
      icon={<IntegrationLogo kind="slack" />}
      label={m.slack_profile_workspace({
        org: profile.orgName,
        workspace: profile.teamName
      })}
      description={
        <span className={cn(state.waiting && "animate-pulse")}>
          {profile.slackUserId
            ? m.slack_profile_connected({
                name: profile.displayName ?? profile.slackUserId
              })
            : m.slack_profile_description()}
        </span>
      }
      error={
        mutationErrorText(state, slackActionErrorMessage) ??
        (profile.slackUserId ? null : oauthError)
      }
    >
      {profile.slackUserId ? (
        <Button
          type="button"
          variant="tertiary"
          size="sm"
          disabled={state.waiting}
          onClick={() => disconnect()}
        >
          {m.slack_disconnect()}
        </Button>
      ) : (
        <Button
          size="sm"
          render={
            <a
              href={`/api/integrations/slack/oauth/start?orgSlug=${encodeURIComponent(profile.orgSlug)}`}
            />
          }
        >
          {m.slack_profile_connect()}
        </Button>
      )}
    </SettingsRow>
  )
}
