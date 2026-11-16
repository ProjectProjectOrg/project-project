import { describe, expect, it } from "vitest"

import type { LiveEntry } from "./LiveChanges"
import { changesOf, decodeCursor, encodeCursor } from "./liveCursor"

const entry = (overrides: Partial<LiveEntry>): LiveEntry => ({
  projectId: "p1",
  orgSlug: "acme",
  slug: "web",
  generation: 1,
  sequence: 4,
  origin: "tab-1",
  changes: [],
  reset: false,
  ...overrides
})

describe("liveCursor", () => {
  it("round-trips each project's position and rejects a malformed cursor", () => {
    const vector = new Map([
      ["5d0c9a8e-0000-4000-8000-000000000001", { generation: 2, sequence: 17 }],
      ["5d0c9a8e-0000-4000-8000-000000000002", { generation: 1, sequence: 0 }]
    ])
    expect(decodeCursor(encodeCursor(vector))).toEqual(vector)
    expect(decodeCursor("")).toEqual(new Map())
    expect(decodeCursor("p1.one.2")).toBeNull()
  })

  it("turns log entries into the live changes clients already understand", () => {
    expect(
      changesOf(
        entry({
          changes: [
            { kind: "ticket", id: "T-1", op: "upsert" },
            { kind: "comments", id: "T-1", op: "upsert" },
            { kind: "group", id: "G-2", op: "delete" },
            { kind: "status", id: "done", op: "upsert" }
          ]
        }),
        "c"
      ).map((change) => change.kind)
    ).toEqual(["ticket", "comments", "group", "tickets"])
    expect(changesOf(entry({ reset: true }), "c")).toEqual([
      {
        kind: "tickets",
        orgSlug: "acme",
        slug: "web",
        origin: "tab-1",
        cursor: "c"
      }
    ])
  })
})
