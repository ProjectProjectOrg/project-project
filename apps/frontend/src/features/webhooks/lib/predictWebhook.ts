import type { UpdateWebhookInput, Webhook } from "@pp/shared"

const displayUrl = (raw: string, fallback: string) => {
  if (!URL.canParse(raw)) return fallback
  const url = new URL(raw)
  const bare = url.pathname === "/" && url.search === ""
  return `${url.protocol}//${url.host}${bare ? "" : "/…"}`
}

export const predictWebhookUpdate = (
  webhook: Webhook,
  input: UpdateWebhookInput
): Webhook => ({
  ...webhook,
  url:
    input.url === undefined ? webhook.url : displayUrl(input.url, webhook.url),
  headerNames:
    input.headers === undefined
      ? webhook.headerNames
      : input.headers.map((header) => header.name),
  events: input.events ?? webhook.events
})
