import { useAtomSet, useAtomValue } from "@effect/atom-react"
import * as Result from "effect/reactivity/AsyncResult"
import { type FormEvent, useState } from "react"

import { SettingsRow } from "@/components/shell/settings/SettingsSection"
import { SettingsInput } from "@/components/shell/settings/SettingsTextField"
import { Button } from "@/components/ui/button"
import { ConfirmButton } from "@/components/ui/confirm-button"
import {
  connectEverhourProfileAtom,
  disconnectEverhourProfileAtom
} from "@/features/everhour/atoms/everhour"
import { IntegrationLogo } from "@/features/integrations/components/IntegrationLogo"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

export function EverhourRows({
  everhour
}: Readonly<{
  everhour: Readonly<{
    connected: boolean
    everhourUserId: string | null
    name: string | null
    email: string | null
    lastCheckError: string | null
  }>
}>) {
  const [apiKey, setApiKey] = useState("")
  const connect = useAtomSet(connectEverhourProfileAtom, { mode: "promise" })
  const disconnect = useAtomSet(disconnectEverhourProfileAtom, {
    mode: "promise"
  })
  const connectState = useAtomValue(connectEverhourProfileAtom)
  const disconnectState = useAtomValue(disconnectEverhourProfileAtom)
  const waiting = connectState.waiting || disconnectState.waiting
  const error = Result.isFailure(connectState)
    ? m.profile_everhour_connect_error()
    : Result.isFailure(disconnectState)
      ? m.profile_everhour_disconnect_error()
      : everhour.lastCheckError

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const trimmed = apiKey.trim()
    if (!trimmed) return
    await connect({ apiKey: trimmed })
    setApiKey("")
  }

  return (
    <>
      <SettingsRow
        icon={<IntegrationLogo kind="everhour" />}
        label={m.profile_everhour_title()}
        description={
          <span className={cn(waiting && "animate-pulse")}>
            {everhour.connected
              ? (everhour.email ?? everhour.name ?? everhour.everhourUserId)
              : m.profile_everhour_description()}
          </span>
        }
        error={error}
      >
        {everhour.connected ? (
          <ConfirmButton.Root>
            <ConfirmButton.Trigger
              type="button"
              variant="tertiary"
              size="sm"
              disabled={waiting}
            >
              {m.profile_everhour_disconnect_button()}
            </ConfirmButton.Trigger>
            <ConfirmButton.Confirm>
              <ConfirmButton.Action
                prompt={m.profile_everhour_disconnect_confirm()}
                label={m.profile_everhour_disconnect_button()}
                onConfirm={async () => {
                  await disconnect()
                }}
              />
            </ConfirmButton.Confirm>
          </ConfirmButton.Root>
        ) : null}
      </SettingsRow>
      <SettingsRow
        label={m.profile_everhour_api_key_label()}
        description={
          everhour.connected
            ? m.profile_everhour_connected_status()
            : m.profile_everhour_disconnected_description()
        }
      >
        <form className="flex items-center gap-2" onSubmit={submit}>
          <SettingsInput
            type="password"
            value={apiKey}
            autoComplete="off"
            placeholder={m.profile_everhour_api_key_placeholder()}
            onChange={(event) => setApiKey(event.target.value)}
          />
          <Button
            type="submit"
            size="md"
            variant={everhour.connected ? "tertiary" : "primary"}
            disabled={waiting || !apiKey.trim()}
          >
            {everhour.connected
              ? m.profile_everhour_update_button()
              : m.profile_everhour_connect_button()}
          </Button>
        </form>
      </SettingsRow>
    </>
  )
}
