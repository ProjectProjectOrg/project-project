import { describe, expect, it } from "@effect/vitest"

import { human } from "./format"
import { presentInboxEntry } from "./inbox"

const entry = {
  id: "entry-1",
  revision: 3,
  kind: "mentioned",
  state: "unread",
  clearedBy: null,
  ticket: { id: "PP-7", title: "Fix the sync", projectSlug: "pp" },
  actor: { kind: "system", source: "github" },
  latest: { kind: "mentioned", commentId: "c1" },
  latestAt: "2026-11-27T09:00:00.000Z",
  commentId: "c1",
  excerpt: [
    { kind: "mention", userId: "u2", handle: "bob" },
    { kind: "text", text: " can you check this?" }
  ],
  eventCount: 1,
  readByClientName: null
}

describe("pp inbox list", () => {
  it("shows the ticket, who and what was said, and the id and revision to act on", () => {
    const text = human([presentInboxEntry(entry)], "details")
    expect(text).toContain("PP-7 Fix the sync")
    expect(text).toContain("github")
    expect(text).toContain("@bob can you check this?")
    expect(text).toContain("entry-1")
    expect(text).toMatch(/revision:\s+3/)
  })

  it("says what an update without an excerpt did", () => {
    const text = human(
      [
        presentInboxEntry({
          ...entry,
          kind: "updates",
          latest: { kind: "status_changed", from: "todo", to: "done" },
          excerpt: null
        })
      ],
      "details"
    )
    expect(text).toContain("moved it from todo to done")
  })

  it("leaves anything that isn't an entry as it is", () => {
    expect(presentInboxEntry({ other: true })).toEqual({ other: true })
  })
})
