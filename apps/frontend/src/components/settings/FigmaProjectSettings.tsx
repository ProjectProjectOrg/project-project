import { useAtomSet, useAtomValue } from "@effect/atom-react"
import { Link } from "@tanstack/react-router"
import * as Result from "effect/reactivity/AsyncResult"
import { type FormEvent, useState } from "react"

import { ErrorPage } from "@/components/ErrorPage"
import { IntegrationLogo } from "@/components/settings/IntegrationLogo"
import { SettingsRow } from "@/components/settings/SettingsSection"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  connectFigmaProjectAtom,
  disconnectFigmaProjectAtom,
  figmaProjectRequest,
  figmaProjectStatusAtom
} from "@/features/figma/atoms/figma"
import { useOrgActor } from "@/lib/access"
import {
  type AppError,
  errorMessage,
  figmaStatusErrorMessage
} from "@/lib/errorMessage"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

import { FigmaTokenWalkthrough } from "./FigmaTokenWalkthrough"

export function FigmaProjectSettings({
  orgSlug,
  slug,
  canManage
}: {
  orgSlug: string
  slug: string
  canManage: boolean
}) {
  const req = figmaProjectRequest(orgSlug, slug)
  const status = useAtomValue(figmaProjectStatusAtom(req))

  return Result.matchWithError(status, {
    onInitial: () => (
      <SettingsRow
        icon={<IntegrationLogo kind="figma" />}
        label={m.figma_project_title()}
        description={
          <span className="block h-3 w-40 animate-pulse rounded bg-muted" />
        }
      />
    ),
    onError: (error) => <ErrorPage error={error} contained />,
    onDefect: (defect) => <ErrorPage error={defect} contained />,
    onSuccess: ({ value, waiting }) => (
      <FigmaProjectContent
        orgSlug={orgSlug}
        slug={slug}
        status={value}
        waiting={waiting}
        canManage={canManage}
      />
    )
  })
}

function FigmaProjectContent({
  orgSlug,
  slug,
  status,
  waiting,
  canManage
}: {
  orgSlug: string
  slug: string
  status: {
    connected: boolean
    handle: string | null
    lastCheckError: string | null
    storageConnected: boolean
  }
  waiting: boolean
  canManage: boolean
}) {
  const req = figmaProjectRequest(orgSlug, slug)
  const canSetUpStorage = useOrgActor(orgSlug).call("storage", "connect")
  const [accessToken, setAccessToken] = useState("")
  const connect = useAtomSet(connectFigmaProjectAtom(req), {
    mode: "promise"
  })
  const disconnect = useAtomSet(disconnectFigmaProjectAtom(req), {
    mode: "promise"
  })
  const connectState = useAtomValue(connectFigmaProjectAtom(req))
  const disconnectState = useAtomValue(disconnectFigmaProjectAtom(req))
  const busy = waiting || connectState.waiting || disconnectState.waiting

  const mutationError =
    Result.matchWithError(connectState, {
      onInitial: () => null,
      onSuccess: () => null,
      onError: (err) => errorMessage(err as AppError),
      onDefect: () => m.error_unknown()
    }) ??
    Result.matchWithError(disconnectState, {
      onInitial: () => null,
      onSuccess: () => null,
      onError: (err) => errorMessage(err as AppError),
      onDefect: () => m.error_unknown()
    })
  const error = status.lastCheckError
    ? figmaStatusErrorMessage(status.lastCheckError)
    : mutationError

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const trimmed = accessToken.trim()
    if (!trimmed || !status.storageConnected) return
    await connect({ accessToken: trimmed })
    setAccessToken("")
  }

  return (
    <SettingsRow
      icon={<IntegrationLogo kind="figma" />}
      label={
        <span className="flex items-center gap-1">
          {m.figma_project_title()}
          {canManage && !status.connected ? <FigmaTokenWalkthrough /> : null}
        </span>
      }
      description={
        <span className={cn(busy && "animate-pulse")}>
          {status.connected && status.handle ? (
            <span className="font-mono">{status.handle}</span>
          ) : status.storageConnected ? (
            m.figma_project_description()
          ) : (
            m.figma_project_storage_required()
          )}
        </span>
      }
      error={error}
    >
      {canManage && status.connected ? (
        <Button
          type="button"
          variant="tertiary"
          size="sm"
          loading={disconnectState.waiting}
          disabled={busy}
          onClick={() => void disconnect()}
        >
          {m.figma_project_disconnect_button()}
        </Button>
      ) : null}
      {canManage && !status.connected && status.storageConnected ? (
        <form
          className="flex items-center gap-2"
          onSubmit={(event) => void submit(event)}
        >
          <Input
            type="password"
            value={accessToken}
            autoComplete="off"
            placeholder={m.figma_project_token_label()}
            aria-label={m.figma_project_token_label()}
            onChange={(event) => setAccessToken(event.target.value)}
            className="h-8 w-56"
          />
          <Button
            type="submit"
            size="sm"
            loading={connectState.waiting}
            disabled={busy || !accessToken.trim()}
          >
            {m.figma_project_connect_button()}
          </Button>
        </form>
      ) : null}
      {canManage && !status.storageConnected && canSetUpStorage ? (
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
          {m.figma_project_storage_link()}
        </Button>
      ) : null}
    </SettingsRow>
  )
}
