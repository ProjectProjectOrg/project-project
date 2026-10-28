import type { FeedbackReport } from "@pp/shared"
import * as DateTime from "effect/DateTime"
import { describe, expect, it } from "vitest"

import {
  clientIp,
  feedbackTicketBody,
  fenced,
  inlineCode
} from "./feedbackTicket"

const report: FeedbackReport = {
  id: "01a18200-0000-7000-8000-000000000000",
  kind: "bug",
  title: "Board drags stutter",
  description: "Dragging a card jumps back.",
  reporter: { name: "Ada", email: "ada@example.com" },
  instance: { url: "https://pp.example.com", version: "sha-abc1234" },
  context: { route: "/orgs/acme/projects/web", userAgent: "Firefox" },
  attachments: [],
  submittedAt: DateTime.toDateUtc(DateTime.makeUnsafe("2026-10-28T10:00:00Z"))
}

describe("clientIp", () => {
  it("takes the address the outermost trusted proxy saw", () => {
    expect(clientIp("6.6.6.6, 1.2.3.4, 10.0.0.2", "10.0.0.3", 2)).toBe(
      "1.2.3.4"
    )
  })

  it("ignores entries a client prepends to spoof its address", () => {
    expect(clientIp("9.9.9.9, 1.2.3.4", "10.0.0.3", 1)).toBe("1.2.3.4")
  })

  it("falls back to the socket address without a forwarded header", () => {
    expect(clientIp(undefined, "10.0.0.3", 1)).toBe("10.0.0.3")
  })

  it("uses the socket address when no proxy is trusted", () => {
    expect(clientIp("9.9.9.9", "10.0.0.3", 0)).toBe("10.0.0.3")
  })
})

describe("feedbackTicketBody", () => {
  it("keeps the description as markdown and the details inert", () => {
    const body = feedbackTicketBody(
      {
        ...report,
        reporter: { name: "[x](mention:user/1)", email: "ada@example.com" }
      },
      { verbatim: false }
    )
    expect(body.startsWith("Dragging a card jumps back.\n")).toBe(true)
    expect(body).toContain("`x`")
    expect(body).not.toContain("mention:")
    expect(body).toContain("`sha-abc1234`")
  })

  it("fences the description when verbatim", () => {
    const body = feedbackTicketBody(
      { ...report, description: "use ``` here" },
      { verbatim: true }
    )
    expect(body.startsWith("````text\nuse ``` here\n````")).toBe(true)
  })

  it("omits an empty description", () => {
    const body = feedbackTicketBody(
      { ...report, description: "  " },
      { verbatim: false }
    )
    expect(body.startsWith("## Report details")).toBe(true)
  })
})

describe("inlineCode", () => {
  it("outgrows backtick runs in the text", () => {
    expect(inlineCode("a`b")).toBe("``a`b``")
    expect(fenced("x")).toBe("```text\nx\n```")
  })
})
