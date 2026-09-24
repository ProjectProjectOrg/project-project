import { UserId } from "@pp/shared"
import * as DateTime from "effect/DateTime"
import * as Schema from "effect/Schema"
import { describe, expect, it } from "vitest"

import { recentActivityOf } from "./TicketsLive"

const at = (iso: string) => DateTime.toDate(DateTime.makeUnsafe(iso))
const earlier = at("2026-03-01T00:00:00.000Z")
const later = at("2026-03-05T00:00:00.000Z")
const viewer = Schema.decodeUnknownSync(UserId)("viewer")

const touched = (
  createdBy: string,
  lastCommentAt: Date | null
): Parameters<typeof recentActivityOf>[0] => ({
  lastCommentAt,
  entry: { createdBy, createdAt: earlier }
})

describe("recentActivityOf", () => {
  it("prefers the viewer's latest comment when it is newer than creating", () => {
    expect(recentActivityOf(touched("viewer", later), viewer)).toEqual({
      tag: "commented",
      actor: viewer,
      at: later
    })
  })

  it("reports creating when the viewer never commented", () => {
    expect(recentActivityOf(touched("viewer", null), viewer)).toEqual({
      tag: "created",
      actor: viewer,
      at: earlier
    })
  })

  it("falls back to an assignment with no known actor or time", () => {
    expect(recentActivityOf(touched("someone-else", null), viewer)).toEqual({
      tag: "assigned"
    })
  })
})
