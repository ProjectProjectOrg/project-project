import { describe, expect, it } from "vitest"

import { deliveryOutcomeText } from "./webhookStatus"

describe("deliveryOutcomeText", () => {
  it("prefers the HTTP status code", () => {
    expect(
      deliveryOutcomeText({ lastStatusCode: 503, lastOutcome: "http_503" })
    ).toBe("HTTP 503")
  })

  it("translates outcomes without a response", () => {
    expect(
      deliveryOutcomeText({ lastStatusCode: null, lastOutcome: "timeout" })
    ).toBe("Timed out")
    expect(
      deliveryOutcomeText({
        lastStatusCode: null,
        lastOutcome: "something_new"
      })
    ).toBe("Failed")
    expect(
      deliveryOutcomeText({ lastStatusCode: null, lastOutcome: null })
    ).toBeNull()
  })
})
