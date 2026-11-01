import { useAtomRefresh, useAtomSet, useAtomValue } from "@effect/atom-react"
import type { WebhookDelivery } from "@pp/shared"
import * as DateTime from "effect/DateTime"
import { RefreshCw } from "lucide-react"

import { AsyncView } from "@/components/shell/AsyncView"
import {
  SettingsGroup,
  SettingsRow,
  SettingsSection
} from "@/components/shell/settings/SettingsSection"
import { SettingsSkeleton } from "@/components/shell/settings/SettingsSkeleton"
import { Button } from "@/components/ui/button"
import {
  retryWebhookDelivery,
  webhookDeliveries,
  webhooksFor,
  webhooksRequest,
  type WebhookDeliveriesRequest
} from "@/features/webhooks/atoms/webhooks"
import { canRetry } from "@/features/webhooks/lib/webhookEvents"
import {
  deliveryOutcomeText,
  formatWhen
} from "@/features/webhooks/lib/webhookStatus"
import { mutationErrorText } from "@/lib/mutationError"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

const stateLabel: Readonly<Record<WebhookDelivery["state"], () => string>> = {
  pending: () => m.webhooks_delivery_pending(),
  delivered: () => m.webhooks_delivery_delivered(),
  failed: () => m.webhooks_delivery_failed(),
  expired: () => m.webhooks_delivery_expired()
}

export function DeliveryLog({
  req
}: Readonly<{ req: WebhookDeliveriesRequest }>) {
  const result = useAtomValue(webhookDeliveries(req))
  const refreshDeliveries = useAtomRefresh(webhookDeliveries(req))
  const refreshWebhooks = useAtomRefresh(
    webhooksFor(webhooksRequest(req.params.orgSlug, req.params.slug))
  )
  const refresh = () => {
    refreshDeliveries()
    refreshWebhooks()
  }
  return (
    <SettingsSection
      title={
        <span className="flex items-center gap-2">
          {m.webhooks_deliveries_title()}
          <Button
            type="button"
            variant="quiet"
            size="square-7"
            aria-label={m.webhooks_deliveries_refresh()}
            title={m.webhooks_deliveries_refresh()}
            onClick={refresh}
          >
            <RefreshCw strokeWidth={1.75} />
          </Button>
        </span>
      }
      description={m.webhooks_deliveries_description()}
    >
      <AsyncView
        result={result}
        reset={refresh}
        contained
        onInitial={() => <SettingsSkeleton rows={3} />}
        onSuccess={({ value }) => (
          <SettingsGroup>
            {value.length === 0 ? (
              <SettingsRow label={m.webhooks_deliveries_empty()} />
            ) : (
              value.map((delivery) => (
                <DeliveryRow key={delivery.id} req={req} delivery={delivery} />
              ))
            )}
          </SettingsGroup>
        )}
      />
    </SettingsSection>
  )
}

function DeliveryRow({
  req,
  delivery
}: Readonly<{ req: WebhookDeliveriesRequest; delivery: WebhookDelivery }>) {
  const target = { req, deliveryId: delivery.id }
  const retry = useAtomSet(retryWebhookDelivery(target))
  const state = useAtomValue(retryWebhookDelivery(target))
  const outcome = deliveryOutcomeText(delivery)
  return (
    <SettingsRow
      label={
        <span className="flex items-baseline gap-2">
          <span className="font-mono">{delivery.event}</span>
          <span
            className={cn(
              "text-xs font-normal text-muted-foreground",
              delivery.state === "failed" && "text-destructive",
              state.waiting && "animate-pulse"
            )}
          >
            {stateLabel[delivery.state]()}
          </span>
        </span>
      }
      description={
        <>
          <span className="block">
            {[
              formatWhen(delivery.createdAt),
              m.webhooks_delivery_attempts({ count: delivery.attempts }),
              outcome
            ]
              .filter((part) => part !== null && part !== "")
              .join(" · ")}
          </span>
          <span className="block font-mono text-[11px] select-all">
            {delivery.id}
          </span>
          {delivery.responseExcerpt ? (
            <span className="mt-1 line-clamp-2 block font-mono text-[11px] break-all">
              {delivery.responseExcerpt}
            </span>
          ) : null}
        </>
      }
      error={mutationErrorText(state)}
    >
      {canRetry(delivery, DateTime.toDate(DateTime.nowUnsafe())) ? (
        <Button
          type="button"
          variant="tertiary"
          size="sm"
          loading={state.waiting}
          onClick={() => retry()}
        >
          {m.webhooks_delivery_retry()}
        </Button>
      ) : null}
    </SettingsRow>
  )
}
