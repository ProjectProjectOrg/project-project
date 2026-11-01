import { useAtomRefresh, useAtomSet, useAtomValue } from "@effect/atom-react"
import type { Webhook, WebhookHeader } from "@pp/shared"
import { Link, useNavigate } from "@tanstack/react-router"
import * as Exit from "effect/Exit"
import { ChevronLeft } from "lucide-react"
import { useState } from "react"

import { AsyncView } from "@/components/shell/AsyncView"
import {
  SettingsGroup,
  SettingsRow,
  SettingsSection
} from "@/components/shell/settings/SettingsSection"
import { SettingsSkeleton } from "@/components/shell/settings/SettingsSkeleton"
import { SettingsInput } from "@/components/shell/settings/SettingsTextField"
import { Button } from "@/components/ui/button"
import { ConfirmButton } from "@/components/ui/confirm-button"
import { useProjectRoute } from "@/features/projects/hooks/useProject"
import {
  deleteWebhook,
  rotateWebhookSecret,
  sendWebhookTest,
  setWebhookEnabled,
  updateWebhook,
  webhookDeliveriesRequest,
  webhooksFor,
  webhooksRequest,
  type WebhooksRequest
} from "@/features/webhooks/atoms/webhooks"
import { DeliveryLog } from "@/features/webhooks/components/DeliveryLog"
import { EventSwitches } from "@/features/webhooks/components/EventSwitches"
import { HeadersEditor } from "@/features/webhooks/components/HeadersEditor"
import { SecretReveal } from "@/features/webhooks/components/SecretReveal"
import {
  filledHeaders,
  toggleEvent
} from "@/features/webhooks/lib/webhookEvents"
import { webhookStatusText } from "@/features/webhooks/lib/webhookStatus"
import { mutationErrorText } from "@/lib/mutationError"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

export function WebhookDetail({ webhookId }: Readonly<{ webhookId: string }>) {
  const { orgSlug, slug } = useProjectRoute()
  const req = webhooksRequest(orgSlug, slug)
  const result = useAtomValue(webhooksFor(req))
  const refresh = useAtomRefresh(webhooksFor(req))
  return (
    <div className="flex flex-col gap-6">
      <div>
        <Button
          variant="ghost"
          size="sm"
          render={
            <Link
              to="/orgs/$orgSlug/projects/$slug/settings/webhooks"
              params={{ orgSlug, slug }}
            />
          }
        >
          <ChevronLeft strokeWidth={1.75} />
          {m.webhooks_back()}
        </Button>
      </div>
      <AsyncView
        result={result}
        reset={refresh}
        contained
        onInitial={() => <SettingsSkeleton rows={3} />}
        onSuccess={({ value, waiting }) => {
          const webhook = value.find((item) => item.id === webhookId)
          return webhook ? (
            <Detail req={req} webhook={webhook} waiting={waiting} />
          ) : (
            <SettingsGroup>
              <SettingsRow label={m.webhooks_not_found()} />
            </SettingsGroup>
          )
        }}
      />
    </div>
  )
}

function Detail({
  req,
  webhook,
  waiting
}: Readonly<{ req: WebhooksRequest; webhook: Webhook; waiting: boolean }>) {
  const target = { req, id: webhook.id }
  const deliveriesReq = webhookDeliveriesRequest(
    req.params.orgSlug,
    req.params.slug,
    webhook.id
  )
  const update = useAtomSet(updateWebhook(target))
  const updateState = useAtomValue(updateWebhook(target))
  const [secret, setSecret] = useState<string | null>(null)
  return (
    <>
      <StatusSection target={target} webhook={webhook} waiting={waiting} />
      {secret === null ? null : (
        <SecretReveal secret={secret} onDone={() => setSecret(null)} />
      )}
      <EndpointSection
        target={target}
        webhook={webhook}
        onRotated={setSecret}
      />
      <EventSwitches
        events={webhook.events}
        disabled={updateState.waiting}
        onToggle={(kind, on) =>
          update({ events: toggleEvent(webhook.events, kind, on) })
        }
      />
      <DeliveryLog req={deliveriesReq} />
      <DeleteSection target={target} />
    </>
  )
}

type Target = Readonly<{ req: WebhooksRequest; id: string }>

function StatusSection({
  target,
  webhook,
  waiting
}: Readonly<{ target: Target; webhook: Webhook; waiting: boolean }>) {
  const deliveriesReq = webhookDeliveriesRequest(
    target.req.params.orgSlug,
    target.req.params.slug,
    webhook.id
  )
  const setEnabled = useAtomSet(setWebhookEnabled(target))
  const enabledState = useAtomValue(setWebhookEnabled(target))
  const test = useAtomSet(sendWebhookTest(deliveriesReq))
  const testState = useAtomValue(sendWebhookTest(deliveriesReq))
  const active = webhook.status === "active"
  return (
    <SettingsSection>
      <SettingsGroup>
        <SettingsRow
          label={<span className="font-mono">{webhook.url}</span>}
          description={
            <span
              className={cn(
                (waiting || enabledState.waiting) && "animate-pulse",
                !active && "text-destructive"
              )}
            >
              {webhookStatusText(webhook)}
            </span>
          }
          error={
            mutationErrorText(enabledState) ?? mutationErrorText(testState)
          }
        >
          {active ? (
            <Button
              type="button"
              variant="tertiary"
              size="sm"
              loading={testState.waiting}
              onClick={() => test()}
            >
              {m.webhooks_test()}
            </Button>
          ) : null}
          <Button
            type="button"
            variant="tertiary"
            size="sm"
            loading={enabledState.waiting}
            onClick={() => setEnabled(!active)}
          >
            {active ? m.webhooks_disable() : m.webhooks_enable()}
          </Button>
        </SettingsRow>
      </SettingsGroup>
    </SettingsSection>
  )
}

function EndpointSection({
  target,
  webhook,
  onRotated
}: Readonly<{
  target: Target
  webhook: Webhook
  onRotated: (secret: string) => void
}>) {
  const update = useAtomSet(updateWebhook(target), { mode: "promiseExit" })
  const updateState = useAtomValue(updateWebhook(target))
  const rotate = useAtomSet(rotateWebhookSecret(target), {
    mode: "promiseExit"
  })
  const [editing, setEditing] = useState<"url" | "headers" | null>(null)
  const [url, setUrl] = useState("")
  const [headers, setHeaders] = useState<ReadonlyArray<WebhookHeader>>([])
  const save = async () => {
    const exit = await update(
      editing === "url"
        ? { url: url.trim() }
        : { headers: filledHeaders(headers) }
    )
    if (Exit.isSuccess(exit)) setEditing(null)
  }
  const error = editing === null ? null : mutationErrorText(updateState)
  return (
    <SettingsSection title={m.webhooks_endpoint_title()}>
      <SettingsGroup>
        <SettingsRow
          label={m.webhooks_url_label()}
          description={
            editing === "url" ? (
              m.webhooks_url_hint()
            ) : (
              <span className="font-mono">{webhook.url}</span>
            )
          }
          error={editing === "url" ? error : null}
        >
          {editing === "url" ? (
            <>
              <SettingsInput
                type="url"
                autoComplete="off"
                placeholder="https://"
                className="w-72 font-mono"
                value={url}
                disabled={updateState.waiting}
                onChange={(event) => setUrl(event.target.value)}
              />
              <EditActions
                busy={updateState.waiting}
                canSave={url.trim() !== ""}
                onSave={save}
                onCancel={() => setEditing(null)}
              />
            </>
          ) : (
            <Button
              type="button"
              variant="tertiary"
              size="sm"
              onClick={() => {
                setUrl("")
                setEditing("url")
              }}
            >
              {m.webhooks_url_replace()}
            </Button>
          )}
        </SettingsRow>
        <SettingsRow
          layout={editing === "headers" ? "stacked" : "inline"}
          label={m.webhooks_headers_label()}
          description={
            editing === "headers" ? (
              m.webhooks_headers_replace_hint()
            ) : webhook.headerNames.length > 0 ? (
              <span className="font-mono">
                {webhook.headerNames.join(", ")}
              </span>
            ) : (
              m.webhooks_headers_none()
            )
          }
          error={editing === "headers" ? error : null}
        >
          {editing === "headers" ? (
            <div className="flex w-full flex-col gap-3">
              <HeadersEditor
                headers={headers}
                disabled={updateState.waiting}
                onChange={setHeaders}
              />
              <div className="flex justify-end gap-2">
                <EditActions
                  busy={updateState.waiting}
                  canSave
                  onSave={save}
                  onCancel={() => setEditing(null)}
                />
              </div>
            </div>
          ) : (
            <Button
              type="button"
              variant="tertiary"
              size="sm"
              onClick={() => {
                setHeaders(
                  webhook.headerNames.map((name) => ({ name, value: "" }))
                )
                setEditing("headers")
              }}
            >
              {m.webhooks_headers_replace()}
            </Button>
          )}
        </SettingsRow>
        <SettingsRow
          label={m.webhooks_secret_label()}
          description={m.webhooks_secret_fingerprint({
            fingerprint: webhook.secretFingerprint
          })}
        >
          <ConfirmButton.Root>
            <ConfirmButton.Trigger variant="tertiary" size="sm">
              {m.webhooks_secret_rotate()}
            </ConfirmButton.Trigger>
            <ConfirmButton.Confirm>
              <ConfirmButton.Action
                prompt={m.webhooks_secret_rotate_confirm()}
                label={m.webhooks_secret_rotate()}
                onConfirm={async () => {
                  const exit = await rotate()
                  if (Exit.isFailure(exit)) return false
                  onRotated(exit.value.secret)
                  return true
                }}
              />
            </ConfirmButton.Confirm>
          </ConfirmButton.Root>
        </SettingsRow>
      </SettingsGroup>
    </SettingsSection>
  )
}

function EditActions({
  busy,
  canSave,
  onSave,
  onCancel
}: Readonly<{
  busy: boolean
  canSave: boolean
  onSave: () => Promise<void>
  onCancel: () => void
}>) {
  return (
    <>
      <Button
        type="button"
        variant="tertiary"
        size="sm"
        disabled={busy}
        onClick={onCancel}
      >
        {m.webhooks_edit_cancel()}
      </Button>
      <Button
        type="button"
        variant="primary"
        size="sm"
        loading={busy}
        disabled={!canSave}
        onClick={() => void onSave()}
      >
        {m.webhooks_edit_save()}
      </Button>
    </>
  )
}

function DeleteSection({ target }: Readonly<{ target: Target }>) {
  const remove = useAtomSet(deleteWebhook(target), { mode: "promiseExit" })
  const navigate = useNavigate()
  return (
    <SettingsSection>
      <SettingsGroup>
        <SettingsRow
          label={m.webhooks_delete()}
          description={m.webhooks_delete_description()}
        >
          <ConfirmButton.Root>
            <ConfirmButton.Trigger variant="tertiary" size="sm">
              {m.webhooks_delete()}
            </ConfirmButton.Trigger>
            <ConfirmButton.Confirm>
              <ConfirmButton.Action
                prompt={m.webhooks_delete_confirm()}
                label={m.common_delete_confirm_button()}
                busyLabel={m.common_deleting_button()}
                onConfirm={async () => {
                  const exit = await remove()
                  if (Exit.isFailure(exit)) return false
                  void navigate({
                    to: "/orgs/$orgSlug/projects/$slug/settings/webhooks",
                    params: target.req.params
                  })
                  return true
                }}
              />
            </ConfirmButton.Confirm>
          </ConfirmButton.Root>
        </SettingsRow>
      </SettingsGroup>
    </SettingsSection>
  )
}
