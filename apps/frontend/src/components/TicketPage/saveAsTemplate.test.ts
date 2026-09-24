import {
  BUILTIN_BLOCKS,
  blockLookupFor,
  formatTicketBlock,
  stripHints,
  type BlockDefinition,
  type TagName
} from "@pp/shared"
import { describe, expect, it } from "vitest"

import { libraryOf } from "@/components/Library/libraryEditorTestKit"

import {
  freeTemplateKey,
  lookupForLayer,
  saveAsTemplateDraft,
  saveAsTemplateSummary
} from "./saveAsTemplate"

const definition = (
  key: string,
  origin: BlockDefinition["origin"] = "project"
): BlockDefinition => ({
  ...BUILTIN_BLOCKS.find((block) => block.key === key)!,
  origin,
  shadows: null,
  hidden: false
})

const context = definition("context")
const steps = definition("steps-to-reproduce", "org")

const lookup = blockLookupFor(libraryOf([context, steps], []))

const body = [
  formatTicketBlock("context", stripHints(context.content)),
  formatTicketBlock("steps-to-reproduce", "## Steps to reproduce\n\n1. Log in"),
  formatTicketBlock("scratch", "## Scratch\n\nAd hoc")
].join("\n\n")

const ticket = {
  type: "bug" as const,
  priority: "high" as const,
  tags: ["auth" as TagName],
  body
}

describe("saveAsTemplateSummary", () => {
  it("turns pristine blocks into references and keeps edited ones inline", () => {
    const summary = saveAsTemplateSummary(body, lookup)
    expect(summary.blocks).toBe(3)
    expect(summary.customized).toBe(2)
    expect(summary.body).toBe(
      [
        formatTicketBlock("context", ""),
        formatTicketBlock(
          "steps-to-reproduce",
          "## Steps to reproduce\n\n1. Log in"
        ),
        formatTicketBlock("scratch", "## Scratch\n\nAd hoc")
      ].join("\n\n")
    )
  })

  it("keeps project blocks inline when saving to the org", () => {
    const summary = saveAsTemplateSummary(body, lookupForLayer(lookup, "org"))
    expect(summary.customized).toBe(3)
    expect(summary.body).toContain(
      formatTicketBlock("context", stripHints(context.content))
    )
  })
})

describe("saveAsTemplateDraft", () => {
  const options = {
    name: "Login bug",
    includeType: true,
    includePriority: false,
    includeTags: false
  }

  it("includes only the type by default and never the title or assignees", () => {
    const draft = saveAsTemplateDraft(ticket, options, lookup, new Set())
    expect(draft).toEqual({
      key: "login-bug",
      name: "Login bug",
      icon: "LayoutTemplate",
      color: null,
      description: "",
      type: "bug",
      priority: null,
      tags: [],
      body: saveAsTemplateSummary(body, lookup).body
    })
  })

  it("respects the include toggles", () => {
    const draft = saveAsTemplateDraft(
      ticket,
      {
        ...options,
        includeType: false,
        includePriority: true,
        includeTags: true
      },
      lookup,
      new Set()
    )
    expect(draft).toMatchObject({
      type: null,
      priority: "high",
      tags: ["auth"]
    })
  })
})

describe("freeTemplateKey", () => {
  it("slugifies the name and steps around taken and reserved keys", () => {
    expect(freeTemplateKey("Bug", new Set())).toBe("bug")
    expect(freeTemplateKey("Bug", new Set(["bug", "bug-2"]))).toBe("bug-3")
    expect(freeTemplateKey("Blank", new Set())).toBe("blank-2")
    expect(freeTemplateKey("!!!", new Set())).toBe("template")
  })
})
