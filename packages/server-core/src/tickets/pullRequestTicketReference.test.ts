import * as Option from "effect/Option"
import { describe, expect, it } from "vitest"

import {
  pickPullRequestTicket,
  pullRequestTicketReferences,
  type PullRequestText
} from "./pullRequestTicketReference"

const pick = (pr: Partial<PullRequestText>, existing: ReadonlyArray<string>) =>
  Option.getOrNull(
    pickPullRequestTicket(
      pullRequestTicketReferences({
        branch: "fix-login",
        title: "Fix login",
        body: "",
        ...pr
      }),
      new Set(existing)
    )
  )

describe("pickPullRequestTicket", () => {
  it.each([
    {
      name: "the branch name",
      pr: { branch: "feat/T-1-login" },
      expected: { source: "branch", ticketId: "T-1" }
    },
    {
      name: "the title",
      pr: { title: "T-2: fix login" },
      expected: { source: "title", ticketId: "T-2" }
    },
    {
      name: "a closing keyword in the description",
      pr: { body: "Fixes T-3" },
      expected: { source: "body", ticketId: "T-3" }
    },
    {
      name: "the branch name over the title and description",
      pr: { branch: "T-1", title: "T-2: fix login", body: "Fixes T-3" },
      expected: { source: "branch", ticketId: "T-1" }
    },
    {
      name: "the title when the branch only names unknown keys",
      pr: { branch: "fix-utf-8", title: "T-2: fix login" },
      expected: { source: "title", ticketId: "T-2" }
    },
    {
      name: "nothing when the deciding source names two tickets",
      pr: { title: "T-1, T-2: fix login", body: "Fixes T-3" },
      expected: null
    },
    {
      name: "nothing when only unknown tickets are named",
      pr: { title: "T-9: fix login" },
      expected: null
    }
  ])("picks $name", ({ pr, expected }) => {
    expect(pick(pr, ["T-1", "T-2", "T-3"])).toEqual(expected)
  })
})
