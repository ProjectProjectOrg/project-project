import { describe, expect, it } from "@effect/vitest"
import { TicketId, TicketStatus } from "@pp/shared"
import * as DateTime from "effect/DateTime"
import * as Schema from "effect/Schema"

import type { TicketDocument } from "./TicketDocs"
import { clearedPrMetadata, hasPrMetadata } from "./ticketPrMetadata"

const decodeUnknownTicketIdSync = Schema.decodeUnknownSync(TicketId)

const decodeUnknownTicketStatusSync = Schema.decodeUnknownSync(TicketStatus)

const createdAt = DateTime.toDate(DateTime.makeUnsafe("2026-09-07T10:00:00Z"))

const ticket = (overrides: Partial<TicketDocument>): TicketDocument => ({
  id: decodeUnknownTicketIdSync("T-1"),
  title: "Ticket",
  status: decodeUnknownTicketStatusSync("todo"),
  type: "chore",
  priority: "med",
  tags: [],
  branch: "feat/T-1",
  pr: null,
  prState: null,
  lastTransitionedPr: null,
  assignees: [],
  archivedAt: null,
  createdBy: "user-1",
  createdAt,
  updatedBy: "user-1",
  updatedAt: createdAt,
  body: "# Ticket\n",
  commentsRegion: "",
  ...overrides
})

describe("ticket pr metadata", () => {
  it("finds pull request metadata without an owning PR", () => {
    expect(hasPrMetadata(ticket({}))).toBe(false)
    expect(hasPrMetadata(ticket({ prDraft: true }))).toBe(true)
    expect(hasPrMetadata(ticket({ prBase: "old-default" }))).toBe(true)
    expect(
      hasPrMetadata(
        ticket({ stack: [{ branch: "feat/T-1-ui", base: "feat/T-1" }] })
      )
    ).toBe(false)
    expect(
      hasPrMetadata(
        ticket({
          stack: [{ branch: "feat/T-1-ui", base: "feat/T-1", pr: 4 }]
        })
      )
    ).toBe(true)
  })

  it("clears pull requests on every branch and keeps the stack's shape", () => {
    const cleared = clearedPrMetadata(
      ticket({
        pr: 3,
        prBase: "old-default",
        prState: "merged",
        prDraft: true,
        lastTransitionedPr: 3,
        stack: [
          {
            branch: "feat/T-1-ui",
            base: "feat/T-1",
            pr: 4,
            prState: "merged",
            prDraft: true,
            landed: true
          }
        ]
      })
    )

    expect(cleared).toMatchObject({
      branch: "feat/T-1",
      pr: null,
      prState: null,
      prDraft: false,
      prBase: undefined,
      lastTransitionedPr: null,
      stack: [{ branch: "feat/T-1-ui", base: "feat/T-1" }]
    })
    expect(cleared.stack?.[0]).toStrictEqual({
      branch: "feat/T-1-ui",
      base: "feat/T-1"
    })
  })
})
