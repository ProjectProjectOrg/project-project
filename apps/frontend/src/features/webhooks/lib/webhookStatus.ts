import type { Webhook } from "@pp/shared"

import { m } from "@/paraglide/messages"
import { getLocale } from "@/paraglide/runtime"

export const formatWhen = (date: Date) =>
  new Intl.DateTimeFormat(getLocale(), {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date)

export const disabledReasonText = (reason: string | null) => {
  switch (reason) {
    case "manual":
      return m.webhooks_disabled_manual()
    case "gone":
      return m.webhooks_disabled_gone()
    case "failing":
      return m.webhooks_disabled_failing()
    default:
      return m.webhooks_disabled_unknown()
  }
}

export const webhookStatusText = (webhook: Webhook) =>
  webhook.status === "disabled"
    ? disabledReasonText(webhook.disabledReason)
    : webhook.failureCount > 0
      ? m.webhooks_status_retrying({
          count: webhook.failureCount,
          when: formatWhen(webhook.nextAttemptAt)
        })
      : webhook.lastSuccessAt
        ? m.webhooks_status_last_delivered({
            when: formatWhen(webhook.lastSuccessAt)
          })
        : m.webhooks_status_no_deliveries()

const outcomeMessages: Readonly<Record<string, () => string>> = {
  timeout: () => m.webhooks_outcome_timeout(),
  connection: () => m.webhooks_outcome_connection(),
  dns: () => m.webhooks_outcome_dns(),
  tls: () => m.webhooks_outcome_tls(),
  blocked_address: () => m.webhooks_outcome_blocked_address(),
  invalid_url: () => m.webhooks_outcome_invalid_url(),
  configuration: () => m.webhooks_outcome_configuration(),
  redirect: () => m.webhooks_outcome_redirect(),
  body_too_large: () => m.webhooks_outcome_body_too_large(),
  expired: () => m.webhooks_outcome_expired()
}

export const deliveryOutcomeText = (
  delivery: Readonly<{
    lastStatusCode: number | null
    lastOutcome: string | null
  }>
): string | null =>
  delivery.lastStatusCode !== null
    ? m.webhooks_delivery_status_code({ code: delivery.lastStatusCode })
    : delivery.lastOutcome === null
      ? null
      : (outcomeMessages[delivery.lastOutcome]?.() ??
        m.webhooks_outcome_unknown())
