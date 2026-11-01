import { useAtomRefresh, useAtomValue } from "@effect/atom-react"
import type { Webhook } from "@pp/shared"
import { Link, useNavigate } from "@tanstack/react-router"
import { ChevronRight, Plus } from "lucide-react"
import { useState } from "react"

import { AsyncView } from "@/components/shell/AsyncView"
import {
  SettingsGroup,
  SettingsRow,
  SettingsSection
} from "@/components/shell/settings/SettingsSection"
import { SettingsSkeleton } from "@/components/shell/settings/SettingsSkeleton"
import { Button } from "@/components/ui/button"
import { useProjectRoute } from "@/features/projects/hooks/useProject"
import {
  webhooksFor,
  webhooksRequest,
  type WebhooksRequest
} from "@/features/webhooks/atoms/webhooks"
import { SecretReveal } from "@/features/webhooks/components/SecretReveal"
import { CreateWebhookForm } from "@/features/webhooks/forms/create-webhook"
import { webhookStatusText } from "@/features/webhooks/lib/webhookStatus"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

type Mode =
  | Readonly<{ kind: "list" }>
  | Readonly<{ kind: "create" }>
  | Readonly<{ kind: "created"; id: string; secret: string }>

export function WebhooksSettings() {
  const { orgSlug, slug } = useProjectRoute()
  const req = webhooksRequest(orgSlug, slug)
  const result = useAtomValue(webhooksFor(req))
  const refresh = useAtomRefresh(webhooksFor(req))
  return (
    <AsyncView
      result={result}
      reset={refresh}
      contained
      onInitial={() => <SettingsSkeleton rows={2} />}
      onSuccess={({ value, waiting }) => (
        <Webhooks req={req} webhooks={value} waiting={waiting} />
      )}
    />
  )
}

function Webhooks({
  req,
  webhooks,
  waiting
}: Readonly<{
  req: WebhooksRequest
  webhooks: ReadonlyArray<Webhook>
  waiting: boolean
}>) {
  const [mode, setMode] = useState<Mode>({ kind: "list" })
  const navigate = useNavigate()
  if (mode.kind === "create")
    return (
      <CreateWebhookForm
        req={req}
        onCancel={() => setMode({ kind: "list" })}
        onCreated={(created) => setMode({ kind: "created", ...created })}
      />
    )
  if (mode.kind === "created")
    return (
      <SecretReveal
        secret={mode.secret}
        onDone={() =>
          void navigate({
            to: "/orgs/$orgSlug/projects/$slug/settings/webhooks/$webhookId",
            params: { ...req.params, webhookId: mode.id }
          })
        }
      />
    )
  return (
    <SettingsSection
      title={m.webhooks_list_title()}
      description={m.webhooks_list_description()}
    >
      <SettingsGroup>
        {webhooks.length === 0 ? (
          <SettingsRow
            label={m.webhooks_empty()}
            description={m.webhooks_empty_hint()}
          />
        ) : (
          webhooks.map((webhook) => (
            <SettingsRow
              key={webhook.id}
              label={<span className="font-mono">{webhook.url}</span>}
              description={
                <span
                  className={cn(
                    waiting && "animate-pulse",
                    webhook.status === "disabled" && "text-destructive"
                  )}
                >
                  {m.webhooks_event_count({ count: webhook.events.length })}
                  {" · "}
                  {webhookStatusText(webhook)}
                </span>
              }
            >
              <Button
                variant="ghost"
                size="sm"
                render={
                  <Link
                    to="/orgs/$orgSlug/projects/$slug/settings/webhooks/$webhookId"
                    params={{ ...req.params, webhookId: webhook.id }}
                  />
                }
              >
                {m.webhooks_manage()}
                <ChevronRight strokeWidth={1.75} />
              </Button>
            </SettingsRow>
          ))
        )}
      </SettingsGroup>
      <div>
        <Button
          type="button"
          variant="tertiary"
          size="sm"
          onClick={() => setMode({ kind: "create" })}
        >
          <Plus strokeWidth={1.75} />
          {m.webhooks_add()}
        </Button>
      </div>
    </SettingsSection>
  )
}
