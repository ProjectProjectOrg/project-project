import { useAtomSet, useAtomValue } from "@effect/atom-react"
import { FigmaAuthInvalid, FigmaError } from "@pp/shared"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import * as Result from "effect/reactivity/AsyncResult"
import * as Schema from "effect/Schema"
import { type FormEvent, useEffect, useState } from "react"

import {
  SettingsGroup,
  SettingsRow,
  SettingsSection
} from "@/components/shell/settings/SettingsSection"
import { SettingsInput } from "@/components/shell/settings/SettingsTextField"
import { Button } from "@/components/ui/button"
import { ConfirmButton } from "@/components/ui/confirm-button"
import {
  connectPersonalGithub,
  disconnectPersonalGithub,
  me
} from "@/features/auth/atoms/auth"
import {
  connectEverhourProfileAtom,
  disconnectEverhourProfileAtom
} from "@/features/everhour/atoms/everhour"
import { FigmaProfileSettings } from "@/features/figma/components/FigmaProfileSettings"
import { IntegrationLogo } from "@/features/integrations/components/IntegrationLogo"
import { SlackProfileSettings } from "@/features/slack/components/ProfileSettings"
import { errorMessage } from "@/lib/errorMessage"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

const ConnectionsSearch = Schema.Struct({
  error: Schema.optional(Schema.NonEmptyString),
  figmaError: Schema.optional(Schema.NonEmptyString),
  slackError: Schema.optional(Schema.NonEmptyString)
})

export const Route = createFileRoute("/_authed/profile/connections")({
  component: Connections,
  validateSearch: Schema.toStandardSchemaV1(ConnectionsSearch),
  loader: () => ({
    crumb: {
      type: "static" as const,
      label: m.profile_section_connections_title()
    }
  })
})

function Connections() {
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const viewer = useAtomValue(me())
  const [githubOAuthError] = useState(() =>
    githubOAuthErrorMessage(search.error)
  )
  const [figmaOAuthError] = useState(() =>
    figmaOAuthErrorMessage(search.figmaError)
  )
  const [slackOAuthError] = useState(() =>
    search.slackError ? m.slack_oauth_error() : null
  )

  useEffect(() => {
    if (!search.error && !search.figmaError && !search.slackError) return
    void navigate({ to: ".", search: () => ({}), replace: true })
  }, [navigate, search.error, search.figmaError, search.slackError])

  if (!Result.isSuccess(viewer)) return null
  const user = viewer.value

  return (
    <SettingsSection>
      <SettingsGroup>
        <GithubRow
          connected={user.personalGithub.connected}
          email={user.email}
          oauthError={githubOAuthError}
        />
        <EverhourRows everhour={user.personalEverhour} />
        <FigmaProfileSettings oauthError={figmaOAuthError} />
        <SlackProfileSettings oauthError={slackOAuthError} />
      </SettingsGroup>
    </SettingsSection>
  )
}

function GithubRow({
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

function EverhourRows({
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

function githubOAuthErrorMessage(error: string | undefined): string | null {
  switch (error) {
    case undefined:
      return null
    case "account_already_linked_to_different_user":
      return m.profile_github_error_account_already_linked()
    case "access_denied":
      return m.profile_github_error_access_denied()
    case "email_doesn't_match":
      return m.profile_github_error_email_mismatch()
    case "email_not_found":
    case "unable_to_get_user_info":
      return m.profile_github_error_missing_profile()
    case "invalid_code":
    case "no_code":
    case "state_mismatch":
    case "please_restart_the_process":
      return m.profile_github_error_expired()
    default:
      return m.profile_github_error_generic()
  }
}

function figmaOAuthErrorMessage(error: string | undefined): string | null {
  switch (error) {
    case undefined:
      return null
    case "figma_oauth_callback_invalid":
      return errorMessage(new FigmaAuthInvalid({}))
    default:
      return errorMessage(new FigmaError({ reason: error }))
  }
}
