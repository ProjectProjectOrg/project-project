import { Schema } from "effect"
import { describe, expect, it } from "vitest"

import { JiraIssue } from "./ClientSchemas"
import { issueDetailKinds } from "./ScanV2"

const author = { accountId: "u1", displayName: "Ada" }
const comment = (id: string) => ({
  id,
  author,
  body: "text",
  created: "2026-01-01T00:00:00.000Z"
})

const decodeIssue = Schema.decodeUnknownSync(JiraIssue)

const issue = (fields: Readonly<Record<string, Schema.Json>>) =>
  decodeIssue({ id: "1", key: "APP-1", fields })

describe("issueDetailKinds", () => {
  it("skips child fetches the search payload already proves complete or empty", () => {
    expect(
      issueDetailKinds(
        issue({
          comment: { comments: [comment("c1")], total: 1 },
          worklog: { worklogs: [], total: 0 },
          watches: { watchCount: 0 },
          votes: { votes: 0 }
        })
      )
    ).toEqual(["changelogs"])
  })

  it("fetches whenever the payload is partial, nonzero or missing", () => {
    expect(
      issueDetailKinds(
        issue({
          comment: { comments: [comment("c1")], total: 21 },
          watches: { watchCount: 2 },
          votes: { votes: 1 }
        })
      )
    ).toEqual(["comments", "changelogs", "worklogs", "watchers", "votes"])
  })
})
