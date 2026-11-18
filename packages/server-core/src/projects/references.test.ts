import { FixReferenceAction } from "@pp/shared"
import { describe, expect, it } from "vitest"

import { applyReferenceFix, referenceCandidates } from "./references"

const body =
  "Ask [Bob](mention:user/old-bob) about [T-9](mention:ticket/T-9). See [old](https://old.example/orgs/x/projects/y) and [docs](https://docs.example/a)."

describe("referenceCandidates", () => {
  it("finds user and ticket mentions and links to the old instance only", () => {
    expect(
      referenceCandidates(body, "https://old.example").map(
        ({ kind, target, label }) => ({ kind, target, label })
      )
    ).toEqual([
      { kind: "user", target: "old-bob", label: "Bob" },
      { kind: "ticket", target: "T-9", label: "T-9" },
      {
        kind: "link",
        target: "https://old.example/orgs/x/projects/y",
        label: "old"
      }
    ])
  })
})

it("shows readable reference snippets", () => {
  expect(
    referenceCandidates("Ask [Bob](mention:user/old-bob).", null)[0]?.snippet
  ).toBe("Ask Bob.")
})

describe("applyReferenceFix", () => {
  it("turns a reference into plain text", () => {
    expect(
      applyReferenceFix(
        body,
        { kind: "user", target: "old-bob" },
        FixReferenceAction.cases.plain.make({})
      )
    ).toContain("Ask Bob about")
  })

  it("links an old-instance link to a ticket here, keeping its label", () => {
    expect(
      applyReferenceFix(
        body,
        { kind: "link", target: "https://old.example/orgs/x/projects/y" },
        FixReferenceAction.cases.link.make({ to: "PP-3" })
      )
    ).toContain("See [old](mention:ticket/PP-3)")
  })
})
