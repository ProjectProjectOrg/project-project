import {
  blockLookupFor,
  EMPTY_LAYER,
  formatTicketBlock,
  resolveLibrary,
  TypeKey
} from "@pp/shared"
import { describe, expect, it } from "vitest"

import {
  addSectionGroups,
  slashMenuSections,
  slashTriggerMatch
} from "./slashMenuItems"

describe("slashTriggerMatch", () => {
  it("fires at the start of a line or after whitespace only", () => {
    expect(slashTriggerMatch("/")?.matchingString).toBe("")
    expect(slashTriggerMatch("Some text /acc")?.matchingString).toBe("acc")
    expect(slashTriggerMatch("and/or")).toBeNull()
    expect(slashTriggerMatch("/acc more")).toBeNull()
    expect(slashTriggerMatch("see /etc/hosts")).toBeNull()
  })
})

const keys = (blocks: ReadonlyArray<Readonly<{ key: string }>>) =>
  blocks.map((block) => block.key)

describe("addSectionGroups", () => {
  const library = resolveLibrary({ org: EMPTY_LAYER, project: null }, false)
  const lookup = blockLookupFor(library)
  const bug = TypeKey.make("bug")
  const body = formatTicketBlock("expected-vs-actual", "Broken")

  it("suggests the type's sections the ticket lacks, then lists the rest", () => {
    const groups = addSectionGroups({ library, lookup, ticketType: bug, body })
    expect(groups.suggestedFor).toBe("Bug")
    expect(keys(groups.suggested)).toEqual([
      "steps-to-reproduce",
      "environment",
      "definition-of-done"
    ])
    expect(keys(groups.all)).toEqual(
      keys(library.blocks).filter(
        (key) => !keys(groups.suggested).includes(key)
      )
    )
  })

  it("suggests nothing without a type", () => {
    const groups = addSectionGroups({ library, lookup, ticketType: null, body })
    expect(groups.suggested).toEqual([])
    expect(keys(groups.all)).toEqual(keys(library.blocks))
  })

  it("offers the same sections in the / menu, with no templates", () => {
    const groups = addSectionGroups({ library, lookup, ticketType: bug, body })
    const sections = slashMenuSections({
      library,
      lookup,
      ticketType: bug,
      body,
      query: "",
      basicLabel: (kind) => kind
    })
    const blockKeys = (key: string) =>
      sections
        .find((section) => section.section === key)
        ?.items.flatMap((item) =>
          item.kind === "block" ? [item.definition.key] : []
        )
    expect(sections.map((section) => section.section)).toEqual([
      "suggested",
      "blocks",
      "basic"
    ])
    expect(blockKeys("suggested")).toEqual(keys(groups.suggested))
    expect(blockKeys("blocks")).toEqual(keys(groups.all))
  })
})
