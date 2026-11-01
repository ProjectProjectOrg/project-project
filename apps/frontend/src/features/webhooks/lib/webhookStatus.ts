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
