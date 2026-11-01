import { describe, expect, it } from "vitest"

import { toCreateWebhookInput } from "./opts"

describe("toCreateWebhookInput", () => {
  it("trims the URL and sends only filled headers", () => {
    expect(
      toCreateWebhookInput({
        url: "  https://hooks.example.com/pp ",
        events: ["ticket_created"],
        headers: [
          { name: "Authorization", value: "Bearer x" },
          { name: "", value: "" }
        ]
      })
    ).toEqual({
      url: "https://hooks.example.com/pp",
      events: ["ticket_created"],
      headers: [{ name: "Authorization", value: "Bearer x" }]
    })
  })

  it("leaves headers out when there are none", () => {
    expect(
      toCreateWebhookInput({
        url: "https://hooks.example.com",
        events: ["ticket_created"],
        headers: [{ name: " ", value: "" }]
      })
    ).toEqual({ url: "https://hooks.example.com", events: ["ticket_created"] })
  })
})
