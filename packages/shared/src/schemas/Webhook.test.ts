import * as Schema from "effect/Schema"
import { describe, expect, it } from "vitest"

import { WebhookHeader } from "./Webhook"

const valid = Schema.is(WebhookHeader)

describe("WebhookHeader", () => {
  it("accepts printable ASCII values", () => {
    expect(valid({ name: "Authorization", value: "Bearer abc-123_XYZ=" })).toBe(
      true
    )
  })

  it("rejects values fetch cannot send", () => {
    expect(valid({ name: "X-Project", value: "🚀" })).toBe(false)
    expect(valid({ name: "X-Project", value: "Zürich" })).toBe(false)
    expect(valid({ name: "X-Project", value: "a\r\nInjected: 1" })).toBe(false)
  })
})
