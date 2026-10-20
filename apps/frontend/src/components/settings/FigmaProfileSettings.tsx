import { useAtomSet, useAtomValue } from "@effect/atom-react"
import * as Result from "effect/unstable/reactivity/AsyncResult"

import { ErrorPage } from "@/components/ErrorPage"
import { IntegrationLogo } from "@/components/settings/IntegrationLogo"
import { SettingsRow } from "@/components/settings/SettingsSection"
import { Button } from "@/components/ui/button"
import {
  figmaProfileAtom,
  disconnectFigmaProfileAtom
} from "@/features/figma/atoms/figma"
import { type AppError, errorMessage } from "@/lib/errorMessage"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

export function FigmaProfileSettings({
  oauthError
}: {
  oauthError: string | null
}) {
  const profile = useAtomValue(figmaProfileAtom)

  return Result.matchWithError(profile, {
    onInitial: () => (
      <SettingsRow
        icon={<IntegrationLogo kind="figma" />}
        label={m.figma_profile_title()}
        description={
          <span className="block h-3 w-40 animate-pulse rounded bg-muted" />
        }
      />
    ),
    onError: (error) => <ErrorPage error={error} contained />,
    onDefect: (defect) => <ErrorPage error={defect} contained />,
    onSuccess: ({ value, waiting }) => (
      <FigmaProfileContent
        profile={value}
        waiting={waiting}
        oauthError={oauthError}
      />
    )
  })
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
  const disconnect = useAtomSet(disconnectFigmaProfileAtom, {
    mode: "promise"
  })
  const disconnectState = useAtomValue(disconnectFigmaProfileAtom)
  const busy = waiting || disconnectState.waiting
  const disconnectError = Result.matchWithError(disconnectState, {
    onInitial: () => null,
    onSuccess: () => null,
    onError: (err) => errorMessage(err as AppError),
    onDefect: () => m.error_unknown()
  })
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
          onClick={() => void disconnect()}
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
