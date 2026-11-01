import * as DateTime from "effect/DateTime"
import { describe, expect, it } from "vitest"

import { predictWebhookUpdate } from "./predictWebhook"

const at = DateTime.toDate(DateTime.makeUnsafe("2026-11-01T12:00:00Z"))
const webhook = {
  id: "8d3f0b5e-0000-4000-8000-000000000000",
  url: "https://old.example.com/…",
  events: ["ticket_created" as const],
  headerNames: ["Authorization"],
  secretFingerprint: "abc",
  status: "active" as const,
  disabledReason: null,
  disabledAt: null,
  failureCount: 0,
  nextAttemptAt: at,
  lastSuccessAt: null,
  createdAt: at
}

describe("predictWebhookUpdate", () => {
  it("shows the new URL the way the server will display it", () => {
    expect(
      predictWebhookUpdate(webhook, { url: "https://new.example.com/hook?t=1" })
        .url
    ).toBe("https://new.example.com/…")
    expect(
      predictWebhookUpdate(webhook, { url: "https://new.example.com" }).url
    ).toBe("https://new.example.com")
  })

  it("keeps the current URL when the input can't be parsed", () => {
    expect(predictWebhookUpdate(webhook, { url: "nope" }).url).toBe(webhook.url)
  })

  it("replaces header names and leaves other fields alone", () => {
    expect(
      predictWebhookUpdate(webhook, {
        headers: [{ name: "X-Token", value: "secret" }]
      })
    ).toEqual({ ...webhook, headerNames: ["X-Token"] })
  })
})
