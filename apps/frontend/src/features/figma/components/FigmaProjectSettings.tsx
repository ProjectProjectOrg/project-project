import { useAtomSet, useAtomValue } from "@effect/atom-react"
import type { FigmaProjectIntegrationStatus } from "@pp/shared"
import { Button } from "@pp/ui/button"
import { Input } from "@pp/ui/input"
import { cn } from "@pp/ui/lib/utils"
import { Link } from "@tanstack/react-router"
import * as Exit from "effect/Exit"
import { type FormEvent, useState } from "react"

import { AsyncView } from "@/components/shell/AsyncView"
import { SettingsRow } from "@/components/shell/settings/SettingsSection"
import {
  connectFigmaProjectAtom,
  disconnectFigmaProjectAtom,
  figmaProjectRequest,
  figmaProjectStatusAtom
} from "@/features/figma/atoms/figma"
import { IntegrationLogo } from "@/features/integrations/components/IntegrationLogo"
import { useProjectRoute } from "@/features/projects/hooks/useProject"
import { useOrgActor } from "@/hooks/useActor"
import { figmaStatusErrorMessage } from "@/lib/errorMessage"
import { mutationErrorText } from "@/lib/mutationError"
import { m } from "@/paraglide/messages"

import { FigmaTokenWalkthrough } from "./FigmaTokenWalkthrough"

export function FigmaProjectSettings({ canManage }: { canManage: boolean }) {
  const { orgSlug, slug } = useProjectRoute()
  const req = figmaProjectRequest(orgSlug, slug)
  const status = useAtomValue(figmaProjectStatusAtom(req))

  return (
    <AsyncView
      result={status}
      contained
      onInitial={() => (
        <SettingsRow
          icon={<IntegrationLogo kind="figma" />}
          label={m.figma_project_title()}
          description={
            <span className="block h-3 w-40 animate-pulse rounded bg-muted" />
          }
        />
      )}
      onSuccess={({ value, waiting }) => (
        <FigmaProjectContent
          status={value}
          waiting={waiting}
          canManage={canManage}
        />
      )}
    />
  )
}

type FigmaProjectProps = Readonly<{
  status: FigmaProjectIntegrationStatus
  waiting: boolean
  canManage: boolean
}>

function FigmaProjectContent({
  status,
  waiting,
  canManage
}: FigmaProjectProps) {
  const { orgSlug, slug } = useProjectRoute()
  const req = figmaProjectRequest(orgSlug, slug)
  const canSetUpStorage = useOrgActor(orgSlug).call("storage", "connect")
  const disconnect = useAtomSet(disconnectFigmaProjectAtom(req))
  const connectState = useAtomValue(connectFigmaProjectAtom(req))
  const disconnectState = useAtomValue(disconnectFigmaProjectAtom(req))
  const busy = waiting || connectState.waiting || disconnectState.waiting

  const mutationError =
    mutationErrorText(connectState) ?? mutationErrorText(disconnectState)
  const error = status.lastCheckError
    ? figmaStatusErrorMessage(status.lastCheckError)
    : mutationError

  return (
    <SettingsRow
      icon={<IntegrationLogo kind="figma" />}
      label={
        <span className="flex items-center gap-1">
          {m.figma_project_title()}
          {canManage && !status.connected ? <FigmaTokenWalkthrough /> : null}
        </span>
      }
      description={<FigmaStatusDescription status={status} busy={busy} />}
      error={error}
    >
      {canManage && status.connected ? (
        <Button
          type="button"
          variant="tertiary"
          size="sm"
          loading={disconnectState.waiting}
          disabled={busy}
          onClick={() => disconnect()}
        >
          {m.figma_project_disconnect_button()}
        </Button>
      ) : null}
      {canManage && !status.connected && status.storageConnected ? (
        <FigmaTokenForm req={req} busy={busy} waiting={connectState.waiting} />
      ) : null}
      {canManage && !status.storageConnected && canSetUpStorage ? (
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
          {m.figma_project_storage_link()}
        </Button>
      ) : null}
    </SettingsRow>
  )
}

function FigmaStatusDescription({
  status,
  busy
}: Readonly<{ status: FigmaProjectProps["status"]; busy: boolean }>) {
  return (
    <span className={cn(busy && "animate-pulse")}>
      {status.connected && status.handle ? (
        <span className="tabular-nums">{status.handle}</span>
      ) : status.storageConnected ? (
        m.figma_project_description()
      ) : (
        m.figma_project_storage_required()
      )}
    </span>
  )
}

function FigmaTokenForm({
  req,
  busy,
  waiting
}: Readonly<{
  req: ReturnType<typeof figmaProjectRequest>
  busy: boolean
  waiting: boolean
}>) {
  const [accessToken, setAccessToken] = useState("")
  const connect = useAtomSet(connectFigmaProjectAtom(req), {
    mode: "promiseExit"
  })
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const trimmed = accessToken.trim()
    if (!trimmed) return
    const exit = await connect({ accessToken: trimmed })
    if (Exit.isSuccess(exit)) setAccessToken("")
  }

  return (
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
        loading={waiting}
        disabled={busy || !accessToken.trim()}
      >
        {m.figma_project_connect_button()}
      </Button>
    </form>
  )
}
