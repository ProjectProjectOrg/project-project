import * as DateTime from "effect/DateTime"
import { describe, expect, it } from "vitest"

import { recentActivityOf } from "./TicketsLive"

const at = (iso: string) => DateTime.toDate(DateTime.makeUnsafe(iso))
const earlier = at("2026-03-01T00:00:00.000Z")
const later = at("2026-03-05T00:00:00.000Z")

const touched = (
  createdBy: string,
  lastCommentAt: Date | null
): Parameters<typeof recentActivityOf>[0] => ({
  lastCommentAt,
  entry: { createdBy, createdAt: earlier }
})

describe("recentActivityOf", () => {
  it("prefers the viewer's latest comment when it is newer than creating", () => {
    expect(recentActivityOf(touched("viewer", later), "viewer")).toEqual({
      tag: "commented",
      at: later
    })
  })

  it("reports creating when the viewer never commented", () => {
    expect(recentActivityOf(touched("viewer", null), "viewer")).toEqual({
      tag: "created",
      at: earlier
    })
  })

  it("falls back to assignment when the viewer neither created nor commented", () => {
    expect(recentActivityOf(touched("someone-else", null), "viewer")).toEqual({
      tag: "assigned"
    })
  })
})
