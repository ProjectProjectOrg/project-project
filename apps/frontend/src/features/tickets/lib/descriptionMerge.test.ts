import { describe, expect, it } from "vitest"

import { mergeDescriptions } from "./descriptionMerge"

const doc = (...lines: ReadonlyArray<string>) => lines.join("\n")

const base = doc(
  "# Title",
  "",
  "Intro paragraph.",
  "",
  "- [ ] First",
  "- [ ] Second",
  "",
  "Closing paragraph."
)

describe("mergeDescriptions", () => {
  it.each([
    [
      "edits to different paragraphs",
      doc(
        "# Title",
        "",
        "Intro paragraph, extended.",
        "",
        "- [ ] First",
        "- [ ] Second",
        "",
        "Closing paragraph."
      ),
      doc(
        "# Title",
        "",
        "Intro paragraph.",
        "",
        "- [ ] First",
        "- [ ] Second",
        "",
        "Closing paragraph, by the agent."
      ),
      doc(
        "# Title",
        "",
        "Intro paragraph, extended.",
        "",
        "- [ ] First",
        "- [ ] Second",
        "",
        "Closing paragraph, by the agent."
      )
    ],
    [
      "a ticked checkbox next to the line I'm editing",
      doc(
        "# Title",
        "",
        "Intro paragraph.",
        "",
        "- [ ] First",
        "- [ ] Second, reworded",
        "",
        "Closing paragraph."
      ),
      doc(
        "# Title",
        "",
        "Intro paragraph.",
        "",
        "- [x] First",
        "- [ ] Second",
        "",
        "Closing paragraph."
      ),
      doc(
        "# Title",
        "",
        "Intro paragraph.",
        "",
        "- [x] First",
        "- [ ] Second, reworded",
        "",
        "Closing paragraph."
      )
    ],
    [
      "lines added at the start and at the end",
      doc("Summary line.", "", base),
      doc(base, "", "Appended by the agent."),
      doc("Summary line.", "", base, "", "Appended by the agent.")
    ],
    [
      "my insertion while they delete an unrelated paragraph",
      doc(
        "# Title",
        "",
        "Intro paragraph.",
        "",
        "- [ ] First",
        "- [ ] Second",
        "- [ ] Third",
        "",
        "Closing paragraph."
      ),
      doc(
        "# Title",
        "",
        "- [ ] First",
        "- [ ] Second",
        "",
        "Closing paragraph."
      ),
      doc(
        "# Title",
        "",
        "- [ ] First",
        "- [ ] Second",
        "- [ ] Third",
        "",
        "Closing paragraph."
      )
    ],
    [
      "the same change on both sides",
      doc("Summary line.", "", base),
      doc("Summary line.", "", base, "", "Appended by the agent."),
      doc("Summary line.", "", base, "", "Appended by the agent.")
    ],
    ["only my change", doc(base, "More."), base, doc(base, "More.")],
    ["only their change", base, doc(base, "More."), doc(base, "More.")]
  ])("merges %s", (_, mine, theirs, expected) => {
    expect(mergeDescriptions(base, mine, theirs)).toEqual({
      _tag: "Merged",
      body: expected
    })
  })

  it("reports the lines both sides changed, and nothing else", () => {
    const mine = doc(
      "# Title",
      "",
      "My intro.",
      "",
      "- [ ] First",
      "- [ ] Second",
      "",
      "Closing paragraph, mine."
    )
    const theirs = doc(
      "# Title",
      "",
      "Their intro.",
      "",
      "- [ ] First",
      "- [x] Second",
      "",
      "Closing paragraph."
    )

    expect(mergeDescriptions(base, mine, theirs)).toEqual({
      _tag: "Conflict",
      conflicts: [
        {
          line: 2,
          base: ["Intro paragraph."],
          mine: ["My intro."],
          theirs: ["Their intro."]
        }
      ]
    })
  })

  it.each([
    [
      "at the start",
      doc("Mine first.", base),
      doc("Theirs first.", base),
      { line: 0, base: [], mine: ["Mine first."], theirs: ["Theirs first."] }
    ],
    [
      "at the end",
      doc(base, "Mine last."),
      doc(base, "Theirs last."),
      { line: 8, base: [], mine: ["Mine last."], theirs: ["Theirs last."] }
    ]
  ])(
    "treats two different insertions %s as a conflict",
    (_, mine, theirs, conflict) => {
      expect(mergeDescriptions(base, mine, theirs)).toEqual({
        _tag: "Conflict",
        conflicts: [conflict]
      })
    }
  )
})
