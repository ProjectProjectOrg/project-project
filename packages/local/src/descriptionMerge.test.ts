import { expect, it } from "vitest"

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

it("merges edits to lines the other side left alone", () => {
  const mine = doc(
    "# Title",
    "",
    "Intro paragraph.",
    "",
    "- [ ] First",
    "- [ ] Second, reworded",
    "",
    "Closing paragraph."
  )
  const theirs = doc(
    "# Title",
    "",
    "Intro paragraph.",
    "",
    "- [x] First",
    "- [ ] Second",
    "",
    "Closing paragraph, by the agent."
  )
  expect(mergeDescriptions(base, mine, theirs)).toEqual({
    _tag: "Merged",
    body: doc(
      "# Title",
      "",
      "Intro paragraph.",
      "",
      "- [x] First",
      "- [ ] Second, reworded",
      "",
      "Closing paragraph, by the agent."
    )
  })
})

it("reports only the lines both sides changed as a conflict", () => {
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
