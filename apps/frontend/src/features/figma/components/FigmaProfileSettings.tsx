import { useAtomSet, useAtomValue } from "@effect/atom-react"

import { AsyncView } from "@/components/shell/AsyncView"
import { SettingsRow } from "@/components/shell/settings/SettingsSection"
import { Button } from "@/components/ui/button"
import {
  figmaProfileAtom,
  disconnectFigmaProfileAtom
} from "@/features/figma/atoms/figma"
import { IntegrationLogo } from "@/features/integrations/components/IntegrationLogo"
import { mutationErrorText } from "@/lib/mutationError"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

export function FigmaProfileSettings({
  oauthError
}: {
  oauthError: string | null
}) {
  const profile = useAtomValue(figmaProfileAtom)

  return (
    <AsyncView
      result={profile}
      contained
      onInitial={() => (
        <SettingsRow
          icon={<IntegrationLogo kind="figma" />}
          label={m.figma_profile_title()}
          description={
            <span className="block h-3 w-40 animate-pulse rounded bg-muted" />
          }
        />
      )}
      onSuccess={({ value, waiting }) => (
        <FigmaProfileContent
          profile={value}
          waiting={waiting}
          oauthError={oauthError}
        />
      )}
    />
  )
}

function FigmaProfileContent({
  profile,
  waiting,
  oauthError
}: {
  profile: {
    connected: boolean
    handle: string | null
    email: string | null
  }
  waiting: boolean
  oauthError: string | null
}) {
  const disconnect = useAtomSet(disconnectFigmaProfileAtom)
  const disconnectState = useAtomValue(disconnectFigmaProfileAtom)
  const busy = waiting || disconnectState.waiting
  const disconnectError = mutationErrorText(disconnectState)
  const error = oauthError ?? disconnectError

  return (
    <SettingsRow
      icon={<IntegrationLogo kind="figma" />}
      label={m.figma_profile_title()}
      description={
        <span className={cn(busy && "animate-pulse")}>
          {profile.connected
            ? m.figma_profile_connected_status({
                handle: profile.handle ?? profile.email ?? ""
              })
            : m.figma_profile_description()}
        </span>
      }
      error={error}
    >
      {profile.connected ? (
        <Button
          type="button"
          variant="tertiary"
          size="sm"
          disabled={busy}
          onClick={() => disconnect()}
        >
          {m.figma_profile_disconnect_button()}
        </Button>
      ) : (
        <Button
          size="sm"
          render={<a href="/api/integrations/figma/oauth/start" />}
        >
          {m.figma_profile_connect_button()}
        </Button>
      )}
    </SettingsRow>
  )
}
