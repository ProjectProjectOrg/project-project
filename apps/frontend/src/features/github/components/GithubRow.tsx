import { useAtomSet, useAtomValue } from "@effect/atom-react"
import * as Result from "effect/reactivity/AsyncResult"

import { SettingsRow } from "@/components/shell/settings/SettingsSection"
import { Button } from "@/components/ui/button"
import { ConfirmButton } from "@/components/ui/confirm-button"
import {
  connectPersonalGithub,
  disconnectPersonalGithub
} from "@/features/auth/atoms/auth"
import { IntegrationLogo } from "@/features/integrations/components/IntegrationLogo"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

export function GithubRow({
  connected,
  email,
  oauthError
}: Readonly<{ connected: boolean; email: string; oauthError: string | null }>) {
  const connect = useAtomSet(connectPersonalGithub, { mode: "promise" })
  const disconnect = useAtomSet(disconnectPersonalGithub, { mode: "promise" })
  const connectState = useAtomValue(connectPersonalGithub)
  const disconnectState = useAtomValue(disconnectPersonalGithub)
  const waiting = connectState.waiting || disconnectState.waiting
  const error = Result.isFailure(connectState)
    ? m.profile_github_connect_error()
    : Result.isFailure(disconnectState)
      ? m.profile_github_disconnect_error()
      : oauthError

  return (
    <SettingsRow
      icon={<IntegrationLogo kind="github" />}
      label={m.profile_github_title()}
      description={
        <span className={cn(waiting && "animate-pulse")}>
          {connected ? email : m.profile_github_description()}
        </span>
      }
      error={error}
    >
      {connected ? (
        <>
          <Button
            type="button"
            variant="tertiary"
            size="sm"
            onClick={() => void connect()}
            disabled={waiting}
          >
            {m.profile_github_reconnect_button()}
          </Button>
          <ConfirmButton.Root>
            <ConfirmButton.Trigger
              type="button"
              variant="tertiary"
              size="sm"
              disabled={disconnectState.waiting}
            >
              {m.profile_github_disconnect_button()}
            </ConfirmButton.Trigger>
            <ConfirmButton.Confirm>
              <ConfirmButton.Action
                prompt={m.profile_github_disconnect_confirm_prompt()}
                label={m.profile_github_disconnect_confirm_button()}
                onConfirm={async () => {
                  await disconnect()
                }}
              />
            </ConfirmButton.Confirm>
          </ConfirmButton.Root>
        </>
      ) : (
        <Button
          type="button"
          size="sm"
          onClick={() => void connect()}
          disabled={connectState.waiting}
        >
          {m.profile_github_connect_button()}
        </Button>
      )}
    </SettingsRow>
  )
}
