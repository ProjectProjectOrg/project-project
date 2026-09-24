import * as Schema from "effect/Schema"
import { describe, expect, it } from "vitest"

import {
  BlockDraft,
  Library,
  PartialTemplateDefaults,
  TemplateDefaults
} from "../schemas/Library"
import { formatTicketBlock } from "../ticketBlocks"
import {
  BUILTIN_BLOCKS,
  BUILTIN_TEMPLATE_DEFAULTS,
  BUILTIN_TEMPLATES
} from "./gallery"
import {
  EMPTY_LAYER,
  GALLERY_LAYER,
  blockLookupFor,
  blockMatchesDefinition,
  expandTemplate,
  expandTemplateKeepingHints,
  galleryBlocksFor,
  galleryBlocksToAdopt,
  galleryTemplatesFor,
  isPristineTemplateBody,
  type Layer,
  mergeChecklistTicks,
  mergeTemplateInto,
  resolveLibrary,
  resolveSyncedBlocks,
  templateBodyFromTicket,
  templateFor,
  ticketTypeForTemplate,
  typesDefaultingTo,
  withDefaultsUpdate
} from "./library"

const blockDraft = Schema.decodeUnknownSync(BlockDraft)
const templateDefaults = Schema.decodeUnknownSync(PartialTemplateDefaults)
const isLibrary = Schema.is(Library)

const layer = (overrides: Partial<Layer>): Layer => ({
  ...EMPTY_LAYER,
  ...overrides
})

const NO_DEFAULTS = {
  org: { feat: null, bug: null, chore: null, other: null },
  project: null
} as const

const adoptedAll = resolveLibrary(
  { org: GALLERY_LAYER, project: null },
  { org: BUILTIN_TEMPLATE_DEFAULTS, project: null },
  false
)
const lookup = blockLookupFor(adoptedAll)

const builtinTemplate = (key: string) => {
  const template = BUILTIN_TEMPLATES.find((candidate) => candidate.key === key)
  if (template === undefined) throw new Error(`no built-in template ${key}`)
  return template
}

const blockOf = (library: Library, key: string) =>
  library.blocks.find((block) => block.key === key)
const templateOf = (library: Library, key: string) =>
  library.templates.find((template) => template.key === key)

const orgDone = blockDraft({
  key: "definition-of-done",
  name: "Definition of done",
  icon: "CircleCheckBig",
  color: null,
  description: "Org bar",
  sync: true,
  content: "## Definition of done\n\n- [ ] Reviewed\n- [ ] Security checked"
})

const projectDone = blockDraft({
  ...orgDone,
  description: "Project bar",
  content: "## Done\n\n- [ ] Shipped"
})

const DONE_SNAPSHOT =
  "## Definition of done\n\n- [x] Reviewed and merged\n- [ ] Tests cover the change"

describe("resolveLibrary", () => {
  it("serves nothing until a layer adopts or creates an entry", () => {
    const empty = resolveLibrary(
      { org: EMPTY_LAYER, project: EMPTY_LAYER },
      NO_DEFAULTS,
      false
    )

    expect(empty.blocks).toEqual([])
    expect(empty.templates).toEqual([])
    expect(empty.defaults).toEqual({
      feat: null,
      bug: null,
      chore: null,
      other: null
    })
    expect(isLibrary(empty)).toBe(true)
  })

  it("serves adopted entries from the layer that holds their file", () => {
    expect(adoptedAll.blocks).toHaveLength(16)
    expect(
      adoptedAll.blocks.every(
        (block) => block.origin === "org" && block.shadows === null
      )
    ).toBe(true)
    expect(templateOf(adoptedAll, "incident")?.origin).toBe("org")
    expect(blockOf(adoptedAll, "definition-of-done")?.sync).toBe(true)
  })

  it("lets a project file shadow the org one", () => {
    const library = resolveLibrary(
      {
        org: layer({ blocks: [orgDone] }),
        project: layer({ blocks: [projectDone] })
      },
      NO_DEFAULTS,
      true
    )
    const orgOnly = resolveLibrary(
      { org: layer({ blocks: [orgDone] }), project: null },
      NO_DEFAULTS,
      true
    )

    expect(blockOf(library, "definition-of-done")).toMatchObject({
      description: "Project bar",
      origin: "project",
      shadows: "org",
      hidden: false
    })
    expect(blockOf(orgOnly, "definition-of-done")).toMatchObject({
      description: "Org bar",
      origin: "org",
      shadows: null
    })
    expect(library.canEdit).toBe(true)
  })

  it("lets a project hide an org entry and keeps the content it hides", () => {
    const library = resolveLibrary(
      {
        org: layer({ blocks: [orgDone] }),
        project: layer({ hiddenBlocks: ["definition-of-done"] })
      },
      NO_DEFAULTS,
      false
    )

    expect(blockOf(library, "definition-of-done")).toMatchObject({
      description: "Org bar",
      origin: "project",
      shadows: "org",
      hidden: true
    })
  })

  it("drops a tombstone that hides nothing, built-in keys included", () => {
    const library = resolveLibrary(
      {
        org: layer({
          hiddenBlocks: ["ghost"],
          hiddenTemplates: ["bug-report"]
        }),
        project: layer({ hiddenBlocks: ["notes"] })
      },
      NO_DEFAULTS,
      false
    )

    expect(library.blocks).toEqual([])
    expect(library.templates).toEqual([])
  })
})

describe("template defaults", () => {
  const bug = builtinTemplate("bug-report")
  const spike = builtinTemplate("spike")
  const chore = builtinTemplate("chore")
  const org = layer({ templates: [bug, spike, chore] })

  it("resolves org defaults to adopted templates only", () => {
    const library = resolveLibrary(
      { org, project: null },
      {
        org: templateDefaults({ bug: "bug-report", feat: "feature" }),
        project: null
      },
      false
    )

    expect(library.defaults).toEqual({
      feat: null,
      bug: "bug-report",
      chore: null,
      other: null
    })
    expect(library.ownDefaults).toEqual({ bug: "bug-report", feat: "feature" })
    expect(library.inheritedDefaults).toEqual(NO_DEFAULTS.org)
  })

  it("lets a project override the org default per type", () => {
    const library = resolveLibrary(
      { org, project: EMPTY_LAYER },
      {
        org: templateDefaults({ bug: "bug-report", chore: "chore" }),
        project: templateDefaults({ bug: "spike", chore: null })
      },
      false
    )

    expect(library.defaults).toEqual({
      feat: null,
      bug: "spike",
      chore: null,
      other: null
    })
    expect(library.inheritedDefaults).toEqual({
      feat: null,
      bug: "bug-report",
      chore: "chore",
      other: null
    })
    expect(library.ownDefaults).toEqual({ bug: "spike", chore: null })
  })

  it("inherits nothing a project has hidden", () => {
    const library = resolveLibrary(
      { org, project: layer({ hiddenTemplates: ["bug-report"] }) },
      { org: templateDefaults({ bug: "bug-report" }), project: {} },
      false
    )

    expect(library.inheritedDefaults.bug).toBeNull()
    expect(library.defaults.bug).toBeNull()
  })

  it("merges an update and drops reset types", () => {
    expect(
      withDefaultsUpdate(templateDefaults({ bug: "spike", chore: null }), {
        defaults: templateDefaults({ feat: "feature" }),
        reset: ["bug"]
      })
    ).toEqual({ feat: "feature", chore: null })
  })
})

describe("gallery", () => {
  it("offers every built-in until it is adopted", () => {
    const empty = resolveLibrary(
      { org: EMPTY_LAYER, project: null },
      NO_DEFAULTS,
      false
    )
    expect(galleryTemplatesFor(empty)).toEqual(BUILTIN_TEMPLATES)
    expect(galleryBlocksFor(empty)).toEqual(BUILTIN_BLOCKS)
    expect(galleryTemplatesFor(adoptedAll)).toEqual([])
    expect(galleryBlocksFor(adoptedAll)).toEqual([])
  })

  it("keeps a hidden key out of the gallery", () => {
    const library = resolveLibrary(
      {
        org: layer({ templates: [builtinTemplate("incident")] }),
        project: layer({ hiddenTemplates: ["incident"] })
      },
      NO_DEFAULTS,
      false
    )
    expect(
      galleryTemplatesFor(library).map((template) => template.key)
    ).not.toContain("incident")
  })

  it("adopts the built-in blocks a template references and lacks", () => {
    const context = BUILTIN_BLOCKS.find((block) => block.key === "context")!
    const library = resolveLibrary(
      { org: layer({ blocks: [context] }), project: null },
      NO_DEFAULTS,
      false
    )

    expect(
      galleryBlocksToAdopt(library, builtinTemplate("feature")).map(
        (block) => block.key
      )
    ).toEqual(["acceptance-criteria", "definition-of-done", "out-of-scope"])
    expect(
      galleryBlocksToAdopt(library, builtinTemplate("spike")).map(
        (block) => block.key
      )
    ).toEqual(["approach", "open-questions", "findings"])
    expect(
      galleryBlocksToAdopt(library, builtinTemplate("incident")).map(
        (block) => block.key
      )
    ).toEqual(["acceptance-criteria", "findings", "notes"])
  })
})

describe("templateFor", () => {
  it("returns the default template for a type, or null for blank", () => {
    expect(templateFor(adoptedAll, "bug")?.key).toBe("bug-report")
    expect(templateFor(adoptedAll, "other")).toBeNull()
  })
})

describe("ticketTypeForTemplate", () => {
  const defaults = Schema.decodeUnknownSync(TemplateDefaults)({
    feat: "feature",
    bug: "bug-report",
    chore: "bug-report",
    other: null
  })

  it("is the one type a template is the default for", () => {
    expect(ticketTypeForTemplate(defaults, "feature")).toBe("feat")
  })

  it("is null when the template is the default for several types or none", () => {
    expect(typesDefaultingTo(defaults, "bug-report")).toEqual(["bug", "chore"])
    expect(ticketTypeForTemplate(defaults, "bug-report")).toBeNull()
    expect(ticketTypeForTemplate(defaults, "spike")).toBeNull()
  })
})

describe("expandTemplate", () => {
  it("expands references with hints stripped and synced blocks tagged", () => {
    const expanded = expandTemplate(builtinTemplate("bug-report"), lookup)

    expect(expanded).toContain(
      formatTicketBlock(
        "expected-vs-actual",
        "## Expected vs actual\n\n**Expected:**\n\n**Actual:**"
      )
    )
    expect(expanded).toContain('<block type="definition-of-done" sync>')
    expect(expanded).not.toContain("{{")
  })

  it("uses customizations verbatim minus hints", () => {
    expect(expandTemplate(builtinTemplate("spike"), lookup)).toContain(
      formatTicketBlock("approach", "## Approach")
    )
  })

  it("drops missing and hidden references but keeps loose markdown and customized unknown blocks", () => {
    const hidden = resolveLibrary(
      { org: GALLERY_LAYER, project: layer({ hiddenBlocks: ["notes"] }) },
      NO_DEFAULTS,
      false
    )
    const body = [
      "Read this first. {{Say why}}",
      formatTicketBlock("notes", ""),
      formatTicketBlock("ghost", ""),
      formatTicketBlock("custom", "## Custom {{fill me}}")
    ].join("\n\n")

    expect(expandTemplate({ body }, blockLookupFor(hidden))).toBe(
      ["Read this first.", formatTicketBlock("custom", "## Custom")].join(
        "\n\n"
      )
    )
  })

  it("keeps the trailing space of an empty last task item", () => {
    expect(
      expandTemplate({ body: formatTicketBlock("open-questions", "") }, lookup)
    ).toBe(
      '<block type="open-questions">\n\n## Open questions\n\n- [ ] \n\n</block>'
    )
  })
})

describe("expandTemplateKeepingHints", () => {
  it("expands references but keeps hints, unlike expandTemplate", () => {
    const expanded = expandTemplateKeepingHints(
      builtinTemplate("bug-report"),
      lookup
    )
    expect(expanded).toContain("{{")
    expect(
      expandTemplateKeepingHints(builtinTemplate("bug-report"), lookup)
    ).not.toBe(expandTemplate(builtinTemplate("bug-report"), lookup))
  })

  it("still drops missing references and keeps loose markdown verbatim", () => {
    const hidden = resolveLibrary(
      { org: GALLERY_LAYER, project: layer({ hiddenBlocks: ["notes"] }) },
      NO_DEFAULTS,
      false
    )
    const body = [
      "Read this first. {{Say why}}",
      formatTicketBlock("notes", ""),
      formatTicketBlock("ghost", ""),
      formatTicketBlock("custom", "## Custom {{fill me}}")
    ].join("\n\n")

    expect(expandTemplateKeepingHints({ body }, blockLookupFor(hidden))).toBe(
      [
        "Read this first. {{Say why}}",
        formatTicketBlock("custom", "## Custom {{fill me}}")
      ].join("\n\n")
    )
  })
})

describe("mergeTemplateInto", () => {
  const expanded = expandTemplate(builtinTemplate("bug-report"), lookup)

  it("uses the expanded template for a blank body", () => {
    expect(mergeTemplateInto("  \n", expanded)).toEqual({
      body: expanded,
      added: [
        "expected-vs-actual",
        "steps-to-reproduce",
        "environment",
        "definition-of-done"
      ]
    })
  })

  it("appends only the block types the body lacks, in template order", () => {
    const body = `Intro   \n\n${formatTicketBlock("environment", "## Env\n\n- mine")}\n`

    const merged = mergeTemplateInto(body, expanded)

    expect(merged.added).toEqual([
      "expected-vs-actual",
      "steps-to-reproduce",
      "definition-of-done"
    ])
    expect(merged.body.startsWith(body.trimEnd())).toBe(true)
    expect(merged.body.match(/<block type="environment">/g)).toHaveLength(1)
  })

  it("leaves a body that already has every block untouched", () => {
    const body = `${expanded}\n\nMy notes`

    expect(mergeTemplateInto(body, expanded)).toEqual({ body, added: [] })
  })
})

describe("mergeChecklistTicks", () => {
  const definition =
    "## Definition of done\n\n- [ ] Reviewed and merged\n- [ ] Tests cover the change\n- [ ] {{Deployed}}"

  it("keeps ticks by item text, ignoring case and spacing", () => {
    expect(
      mergeChecklistTicks(
        definition,
        "- [x]  reviewed AND merged\n- [ ] Tests cover the change"
      )
    ).toBe(
      "## Definition of done\n\n- [x] Reviewed and merged\n- [ ] Tests cover the change\n- [ ] "
    )
  })

  it("loses the tick of a reworded item and brings new items in unticked", () => {
    const reworded =
      "## Definition of done\n\n- [ ] Code reviewed\n- [ ] Tests cover the change\n- [ ] Changelog entry"

    expect(
      mergeChecklistTicks(
        reworded,
        "- [x] Reviewed and merged\n- [x] Tests cover the change"
      )
    ).toBe(
      "## Definition of done\n\n- [ ] Code reviewed\n- [x] Tests cover the change\n- [ ] Changelog entry"
    )
  })

  it("drops items the definition removed", () => {
    expect(
      mergeChecklistTicks("- [ ] Only this", "- [x] Only this\n- [x] Gone")
    ).toBe("- [x] Only this")
  })

  it("matches repeated items in order", () => {
    expect(
      mergeChecklistTicks(
        "- [ ] Check\n- [ ] Check",
        "- [ ] Check\n- [x] Check"
      )
    ).toBe("- [ ] Check\n- [x] Check")
  })

  it("keeps ticks when either side has CRLF line endings", () => {
    expect(
      mergeChecklistTicks("## DoD\r\n- [ ] Tests", "## DoD\n- [x] Tests")
    ).toBe("## DoD\n- [x] Tests")
    expect(
      mergeChecklistTicks("## DoD\n- [ ] Tests", "## DoD\r\n- [x] Tests\r\n")
    ).toBe("## DoD\n- [x] Tests")
  })

  it("ignores checklist lines inside fences", () => {
    const fenced = "```\n- [ ] Example\n```\n- [ ] Example"

    expect(
      mergeChecklistTicks(fenced, "```\n- [x] Example\n```\n- [ ] Example")
    ).toBe(fenced)
  })
})

const withDone = (snapshot: string) =>
  [
    "Intro.",
    formatTicketBlock("definition-of-done", snapshot, { sync: true })
  ].join("\n\n")

describe("resolveSyncedBlocks", () => {
  it("returns a body without synced blocks untouched", () => {
    const body = `Intro   \n\n\n${formatTicketBlock("notes", "## Notes")}\n`

    expect(resolveSyncedBlocks(body, lookup)).toBe(body)
    expect(
      resolveSyncedBlocks('```\n<block type="a" sync>\n</block>\n```', lookup)
    ).toBe('```\n<block type="a" sync>\n</block>\n```')
  })

  it("refreshes the snapshot from the definition and keeps ticks", () => {
    const resolved = resolveSyncedBlocks(withDone(DONE_SNAPSHOT), lookup)

    expect(resolved).toBe(
      withDone(
        "## Definition of done\n\n- [x] Reviewed and merged\n- [ ] Tests cover the change\n- [ ] Docs updated where behaviour changed\n- [ ] Verified in the target environment"
      )
    )
    expect(resolveSyncedBlocks(resolved, lookup)).toBe(resolved)
  })

  it("keeps ticks on a CRLF body", () => {
    const crlf = withDone(DONE_SNAPSHOT).replaceAll("\n", "\r\n")

    expect(resolveSyncedBlocks(crlf, lookup)).toBe(
      resolveSyncedBlocks(withDone(DONE_SNAPSHOT), lookup)
    )
    expect(resolveSyncedBlocks(crlf, lookup)).toContain(
      "- [x] Reviewed and merged"
    )
  })

  it("follows the effective layer", () => {
    const library = resolveLibrary(
      {
        org: layer({ blocks: [orgDone] }),
        project: null
      },
      NO_DEFAULTS,
      false
    )

    expect(
      resolveSyncedBlocks(withDone(DONE_SNAPSHOT), blockLookupFor(library))
    ).toBe(
      withDone(
        "## Definition of done\n\n- [ ] Reviewed\n- [ ] Security checked"
      )
    )
  })

  it("treats a synced built-in nobody adopted as deleted", () => {
    const empty = resolveLibrary(
      { org: EMPTY_LAYER, project: EMPTY_LAYER },
      NO_DEFAULTS,
      false
    )

    expect(
      resolveSyncedBlocks(withDone(DONE_SNAPSHOT), blockLookupFor(empty))
    ).toBe(
      ["Intro.", formatTicketBlock("definition-of-done", DONE_SNAPSHOT)].join(
        "\n\n"
      )
    )
  })

  it("turns a block with a missing or unsynced definition into a copy", () => {
    const unsynced = resolveLibrary(
      {
        org: layer({ blocks: [blockDraft({ ...orgDone, sync: false })] }),
        project: null
      },
      NO_DEFAULTS,
      false
    )
    const ghost = formatTicketBlock("ghost", "## Ghost\n\n- [x] kept", {
      sync: true
    })

    expect(resolveSyncedBlocks(ghost, lookup)).toBe(
      formatTicketBlock("ghost", "## Ghost\n\n- [x] kept")
    )
    expect(
      resolveSyncedBlocks(withDone(DONE_SNAPSHOT), blockLookupFor(unsynced))
    ).toBe(
      ["Intro.", formatTicketBlock("definition-of-done", DONE_SNAPSHOT)].join(
        "\n\n"
      )
    )
  })
})

describe("blockMatchesDefinition", () => {
  const definition = blockOf(adoptedAll, "expected-vs-actual")

  it("matches the stripped definition regardless of whitespace", () => {
    if (definition === undefined) throw new Error("missing definition")

    expect(
      blockMatchesDefinition(
        "## Expected vs actual\n**Expected:**   \n\n\n**Actual:**",
        definition
      )
    ).toBe(true)
    expect(
      blockMatchesDefinition(
        "## Expected vs actual\n\n**Expected:** a redirect",
        definition
      )
    ).toBe(false)
  })
})

describe("templateBodyFromTicket", () => {
  it.each(
    BUILTIN_TEMPLATES.map((template) => [template.key, template] as const)
  )("round-trips %s through a ticket", (_key, template) => {
    const expanded = expandTemplate(template, lookup)

    expect(
      expandTemplate(templateBodyFromTicket(expanded, lookup), lookup)
    ).toBe(expanded)
  })

  it("references pristine and synced blocks and keeps edits inline", () => {
    const ticket = [
      "Intro.",
      formatTicketBlock(
        "expected-vs-actual",
        "## Expected vs actual\n\n**Expected:** no loop\n\n**Actual:**"
      ),
      formatTicketBlock(
        "environment",
        "## Environment\n\n- **Where:** \n- **Version:** \n- **Platform:** "
      ),
      formatTicketBlock("definition-of-done", DONE_SNAPSHOT, { sync: true }),
      formatTicketBlock("ghost", "## Ghost", { sync: true })
    ].join("\n\n")

    expect(templateBodyFromTicket(ticket, lookup)).toEqual({
      body: [
        "Intro.",
        formatTicketBlock(
          "expected-vs-actual",
          "## Expected vs actual\n\n**Expected:** no loop\n\n**Actual:**"
        ),
        formatTicketBlock("environment", ""),
        formatTicketBlock("definition-of-done", ""),
        formatTicketBlock("ghost", "## Ghost")
      ].join("\n\n"),
      customized: 2
    })
  })
})

describe("isPristineTemplateBody", () => {
  const template = builtinTemplate("feature")
  const expanded = expandTemplate(template, lookup)

  it("is true for the untouched expansion, even reformatted", () => {
    expect(isPristineTemplateBody(expanded, template, lookup)).toBe(true)
    expect(
      isPristineTemplateBody(
        `${expanded.replaceAll("\n\n", "\n")}\n`,
        template,
        lookup
      )
    ).toBe(true)
  })

  it("is false once anything is typed or ticked", () => {
    expect(
      isPristineTemplateBody(
        expanded.replace("## Context", "## Context\n\nWhy"),
        template,
        lookup
      )
    ).toBe(false)
    expect(
      isPristineTemplateBody(
        expanded.replace("- [ ] Reviewed", "- [x] Reviewed"),
        template,
        lookup
      )
    ).toBe(false)
    expect(isPristineTemplateBody("", template, lookup)).toBe(false)
  })
})
