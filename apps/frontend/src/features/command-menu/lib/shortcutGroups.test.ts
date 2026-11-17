import { expect, it } from "vitest"

import { shortcutGroups } from "./shortcutGroups"

const item = (id: string, group: string, hotkey: string | null = "K") => ({
  id,
  appHotkey: { hotkey, meta: { group } }
})

it("groups bound shortcuts in first-seen group order and drops unbound ones", () => {
  const items = [
    item("open", "General"),
    item("next", "View"),
    item("unbound", "General", null),
    item("help", "General")
  ]

  expect(
    shortcutGroups(items).map(({ group, items: entries }) => [
      group,
      entries.map((each) => each.id)
    ])
  ).toEqual([
    ["General", ["open", "help"]],
    ["View", ["next"]]
  ])
})
