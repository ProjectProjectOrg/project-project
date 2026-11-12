import * as Schema from "effect/Schema"
import { describe, expect, it } from "vitest"

import { formatTicketBlock, parseTicketBlocks } from "../tickets/blocks"
import { BUILTIN_BLOCKS, BUILTIN_TYPES } from "./builtins"
import { GALLERY_BLOCKS, GALLERY_TYPES } from "./gallery"
import { BlockDraft, Library, TypeDraft } from "./Library"
import {
  BASE_LAYER,
  EMPTY_LAYER,
  GALLERY_LAYER,
  blockLookupFor,
  blockMatchesDefinition,
  expandType,
  expandTypeKeepingHints,
  galleryBlocksFor,
  galleryBlocksToAdopt,
  galleryTypesFor,
  isPristineTypeBody,
  type Layer,
  type LibraryLayers,
  mergeChecklistTicks,
  mergeTypeInto,
  resolveLibrary,
  resolveSyncedBlocks,
  typeBodyFromTicket,
  typeFor
} from "./resolve"

const blockDraft = Schema.decodeUnknownSync(BlockDraft)
const typeDraft = Schema.decodeUnknownSync(TypeDraft)
const isLibrary = Schema.is(Library)

const layer = (overrides: Partial<Layer>): Layer => ({
  ...EMPTY_LAYER,
  ...overrides
})

const withoutBuiltins = (layers: LibraryLayers, canEdit: boolean): Library =>
  resolveLibrary(layers, canEdit, EMPTY_LAYER)

const resolveBase = (layers: LibraryLayers): Library =>
  resolveLibrary(layers, false)

const adoptedAll = withoutBuiltins(
  {
    org: { ...GALLERY_LAYER, types: [...BUILTIN_TYPES, ...GALLERY_TYPES] },
    project: null
  },
  false
)
const lookup = blockLookupFor(adoptedAll)

const knownType = (key: string) => {
  const type = [...BUILTIN_TYPES, ...GALLERY_TYPES].find(
    (candidate) => candidate.key === key
  )
  if (type === undefined) throw new Error(`no type ${key}`)
  return type
}

const blockOf = (library: Library, key: string) =>
  library.blocks.find((block) => block.key === key)
const typeOf = (library: Library, key: string) =>
  library.types.find((type) => type.key === key)

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
    const empty = withoutBuiltins(
      { org: EMPTY_LAYER, project: EMPTY_LAYER },
      false
    )

    expect(empty.blocks).toEqual([])
    expect(empty.types).toEqual([])
    expect(isLibrary(empty)).toBe(true)
  })

  it("serves adopted entries from the layer that holds their file", () => {
    expect(adoptedAll.blocks).toHaveLength(16)
    expect(
      adoptedAll.blocks.every(
        (block) => block.origin === "org" && block.shadows === null
      )
    ).toBe(true)
    expect(typeOf(adoptedAll, "incident")?.origin).toBe("org")
    expect(blockOf(adoptedAll, "definition-of-done")?.sync).toBe(true)
  })

  it("lets a project file shadow the org one", () => {
    const library = withoutBuiltins(
      {
        org: layer({ blocks: [orgDone] }),
        project: layer({ blocks: [projectDone] })
      },
      true
    )
    const orgOnly = withoutBuiltins(
      { org: layer({ blocks: [orgDone] }), project: null },
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
    const library = withoutBuiltins(
      {
        org: layer({ blocks: [orgDone] }),
        project: layer({ hiddenBlocks: ["definition-of-done"] })
      },
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
    const library = withoutBuiltins(
      {
        org: layer({
          hiddenBlocks: ["ghost"],
          hiddenTypes: ["bug"]
        }),
        project: layer({ hiddenBlocks: ["notes"] })
      },
      false
    )

    expect(library.blocks).toEqual([])
    expect(library.types).toEqual([])
  })
})

describe("built-in base layer", () => {
  const orgBug = typeDraft({
    ...knownType("bug"),
    name: "Defect",
    body: "Org bug body"
  })
  const projectBug = typeDraft({ ...orgBug, name: "Project defect" })
  const orgContext = blockDraft({
    ...BUILTIN_BLOCKS.find((block) => block.key === "context"),
    description: "Org context"
  })
  const spike = knownType("spike")

  it("serves the built-in types and sections to an organization that added nothing", () => {
    const library = resolveBase({ org: EMPTY_LAYER, project: null })

    expect(library.types.map((type) => type.key).toSorted()).toEqual([
      "bug",
      "chore",
      "epic",
      "feat"
    ])
    expect(library.blocks.map((block) => block.key).toSorted()).toEqual([
      "acceptance-criteria",
      "context",
      "definition-of-done",
      "environment",
      "expected-vs-actual",
      "out-of-scope",
      "steps-to-reproduce"
    ])
    for (const entry of [...library.types, ...library.blocks])
      expect(entry).toMatchObject({
        origin: "builtin",
        shadows: null,
        hidden: false
      })
    expect(isLibrary(library)).toBe(true)
  })

  it.each(BUILTIN_TYPES.map((type) => [type.key, type] as const))(
    "expands %s to a non-empty starting description from built-in sections",
    (_key, type) => {
      const library = resolveBase({ org: EMPTY_LAYER, project: null })
      const expanded = expandType(type, blockLookupFor(library))

      expect(expanded.trim()).not.toBe("")
      expect(
        parseTicketBlocks(expanded).flatMap((segment) =>
          segment.kind === "block" ? [segment.type] : []
        )
      ).toEqual(
        parseTicketBlocks(type.body).flatMap((segment) =>
          segment.kind === "block" ? [segment.type] : []
        )
      )
    }
  )

  it("starts an epic from context and out of scope", () => {
    expect(knownType("epic").body).toBe(
      [
        formatTicketBlock("context", ""),
        formatTicketBlock("out-of-scope", "")
      ].join("\n\n")
    )
  })

  it.each([
    {
      name: "org copy of a built-in",
      layers: { org: layer({ types: [orgBug] }), project: null },
      expected: {
        name: "Defect",
        origin: "org",
        shadows: "builtin",
        hidden: false
      }
    },
    {
      name: "project copy of an unedited built-in",
      layers: { org: EMPTY_LAYER, project: layer({ types: [projectBug] }) },
      expected: {
        name: "Project defect",
        origin: "project",
        shadows: "builtin",
        hidden: false
      }
    },
    {
      name: "project copy over an org copy",
      layers: {
        org: layer({ types: [orgBug] }),
        project: layer({ types: [projectBug] })
      },
      expected: {
        name: "Project defect",
        origin: "project",
        shadows: "org",
        hidden: false
      }
    },
    {
      name: "project hides an unedited built-in",
      layers: { org: EMPTY_LAYER, project: layer({ hiddenTypes: ["bug"] }) },
      expected: {
        name: "Bug",
        origin: "project",
        shadows: "builtin",
        hidden: true
      }
    },
    {
      name: "project hides an org copy",
      layers: {
        org: layer({ types: [orgBug] }),
        project: layer({ hiddenTypes: ["bug"] })
      },
      expected: {
        name: "Defect",
        origin: "project",
        shadows: "org",
        hidden: true
      }
    },
    {
      name: "project reset to the org copy",
      layers: { org: layer({ types: [orgBug] }), project: EMPTY_LAYER },
      expected: {
        name: "Defect",
        origin: "org",
        shadows: "builtin",
        hidden: false
      }
    },
    {
      name: "both layers reset to the built-in",
      layers: { org: EMPTY_LAYER, project: EMPTY_LAYER },
      expected: { name: "Bug", origin: "builtin", shadows: null, hidden: false }
    }
  ] as const)("resolves a type: $name", ({ layers, expected }) => {
    expect(typeOf(resolveBase(layers), "bug")).toMatchObject(expected)
  })

  it("resolves custom types beside the built-in ones", () => {
    const library = resolveBase({
      org: layer({ types: [spike] }),
      project: layer({ types: [typeDraft({ ...spike, key: "research" })] })
    })

    expect(typeOf(library, "spike")).toMatchObject({
      origin: "org",
      shadows: null
    })
    expect(typeOf(library, "research")).toMatchObject({
      origin: "project",
      shadows: null
    })
    expect(library.types).toHaveLength(6)
  })

  it("layers sections the same way as types", () => {
    expect(
      blockOf(
        resolveBase({ org: layer({ blocks: [orgContext] }), project: null }),
        "context"
      )
    ).toMatchObject({
      description: "Org context",
      origin: "org",
      shadows: "builtin"
    })
    expect(
      blockOf(
        resolveBase({
          org: EMPTY_LAYER,
          project: layer({ hiddenBlocks: ["context"] })
        }),
        "context"
      )
    ).toMatchObject({
      description: "Why this ticket exists",
      origin: "project",
      shadows: "builtin",
      hidden: true
    })
  })

  it("keeps the base layer to the seven built-in sections", () => {
    expect(BASE_LAYER.blocks).toHaveLength(7)
    expect(GALLERY_BLOCKS).toHaveLength(16)
  })
})

describe("gallery", () => {
  it("offers every built-in until it is adopted", () => {
    const empty = withoutBuiltins({ org: EMPTY_LAYER, project: null }, false)
    expect(galleryTypesFor(empty)).toEqual(GALLERY_TYPES)
    expect(galleryBlocksFor(empty)).toEqual(GALLERY_BLOCKS)
    expect(galleryTypesFor(adoptedAll)).toEqual([])
    expect(galleryBlocksFor(adoptedAll)).toEqual([])
  })

  it("keeps a hidden key out of the gallery", () => {
    const library = withoutBuiltins(
      {
        org: layer({ types: [knownType("incident")] }),
        project: layer({ hiddenTypes: ["incident"] })
      },
      false
    )
    expect(galleryTypesFor(library).map((type) => type.key)).not.toContain(
      "incident"
    )
  })

  it("adopts the gallery blocks a type references and lacks", () => {
    const context = GALLERY_BLOCKS.find((block) => block.key === "context")!
    const library = withoutBuiltins(
      { org: layer({ blocks: [context] }), project: null },
      false
    )

    expect(
      galleryBlocksToAdopt(library, knownType("feat")).map((block) => block.key)
    ).toEqual(["acceptance-criteria", "out-of-scope", "definition-of-done"])
    expect(
      galleryBlocksToAdopt(library, knownType("spike")).map(
        (block) => block.key
      )
    ).toEqual(["approach", "open-questions", "findings"])
    expect(
      galleryBlocksToAdopt(library, knownType("incident")).map(
        (block) => block.key
      )
    ).toEqual(["acceptance-criteria", "findings", "notes"])
  })
})

describe("typeFor", () => {
  it("returns the visible type with that key, or null", () => {
    expect(typeFor(adoptedAll, "bug")?.name).toBe("Bug")
    expect(typeFor(adoptedAll, "other")).toBeNull()
    expect(
      typeFor(
        resolveBase({
          org: EMPTY_LAYER,
          project: layer({ hiddenTypes: ["bug"] })
        }),
        "bug"
      )
    ).toBeNull()
  })
})

describe("expandType", () => {
  it("expands references with hints stripped and synced blocks tagged", () => {
    const expanded = expandType(knownType("bug"), lookup)

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
    expect(expandType(knownType("spike"), lookup)).toContain(
      formatTicketBlock("approach", "## Approach")
    )
  })

  it("drops missing and hidden references but keeps loose markdown and customized unknown blocks", () => {
    const hidden = withoutBuiltins(
      { org: GALLERY_LAYER, project: layer({ hiddenBlocks: ["notes"] }) },
      false
    )
    const body = [
      "Read this first. {{Say why}}",
      formatTicketBlock("notes", ""),
      formatTicketBlock("ghost", ""),
      formatTicketBlock("custom", "## Custom {{fill me}}")
    ].join("\n\n")

    expect(expandType({ body }, blockLookupFor(hidden))).toBe(
      ["Read this first.", formatTicketBlock("custom", "## Custom")].join(
        "\n\n"
      )
    )
  })

  it("keeps the trailing space of an empty last task item", () => {
    expect(
      expandType({ body: formatTicketBlock("open-questions", "") }, lookup)
    ).toBe(
      '<block type="open-questions">\n\n## Open questions\n\n- [ ] \n\n</block>'
    )
  })
})

describe("expandTypeKeepingHints", () => {
  it("expands references but keeps hints, unlike expandType", () => {
    const expanded = expandTypeKeepingHints(knownType("bug"), lookup)
    expect(expanded).toContain("{{")
    expect(expandTypeKeepingHints(knownType("bug"), lookup)).not.toBe(
      expandType(knownType("bug"), lookup)
    )
  })

  it("still drops missing references and keeps loose markdown verbatim", () => {
    const hidden = withoutBuiltins(
      { org: GALLERY_LAYER, project: layer({ hiddenBlocks: ["notes"] }) },
      false
    )
    const body = [
      "Read this first. {{Say why}}",
      formatTicketBlock("notes", ""),
      formatTicketBlock("ghost", ""),
      formatTicketBlock("custom", "## Custom {{fill me}}")
    ].join("\n\n")

    expect(expandTypeKeepingHints({ body }, blockLookupFor(hidden))).toBe(
      [
        "Read this first. {{Say why}}",
        formatTicketBlock("custom", "## Custom {{fill me}}")
      ].join("\n\n")
    )
  })
})

describe("mergeTypeInto", () => {
  const expanded = expandType(knownType("bug"), lookup)

  it("uses the expanded type for a blank body", () => {
    expect(mergeTypeInto("  \n", expanded)).toEqual({
      body: expanded,
      added: [
        "expected-vs-actual",
        "steps-to-reproduce",
        "environment",
        "definition-of-done"
      ]
    })
  })

  it("appends only the block types the body lacks, in type order", () => {
    const body = `Intro   \n\n${formatTicketBlock("environment", "## Env\n\n- mine")}\n`

    const merged = mergeTypeInto(body, expanded)

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

    expect(mergeTypeInto(body, expanded)).toEqual({ body, added: [] })
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
    const library = withoutBuiltins(
      {
        org: layer({ blocks: [orgDone] }),
        project: null
      },
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
    const empty = withoutBuiltins(
      { org: EMPTY_LAYER, project: EMPTY_LAYER },
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
    const unsynced = withoutBuiltins(
      {
        org: layer({ blocks: [blockDraft({ ...orgDone, sync: false })] }),
        project: null
      },
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

describe("typeBodyFromTicket", () => {
  it.each(
    [...BUILTIN_TYPES, ...GALLERY_TYPES].map(
      (type) => [type.key, type] as const
    )
  )("round-trips %s through a ticket", (_key, type) => {
    const expanded = expandType(type, lookup)

    expect(expandType(typeBodyFromTicket(expanded, lookup), lookup)).toBe(
      expanded
    )
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

    expect(typeBodyFromTicket(ticket, lookup)).toEqual({
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

describe("isPristineTypeBody", () => {
  const type = knownType("feat")
  const expanded = expandType(type, lookup)

  it("is true for the untouched expansion, even reformatted", () => {
    expect(isPristineTypeBody(expanded, type, lookup)).toBe(true)
    expect(
      isPristineTypeBody(`${expanded.replaceAll("\n\n", "\n")}\n`, type, lookup)
    ).toBe(true)
  })

  it("is false once anything is typed or ticked", () => {
    expect(
      isPristineTypeBody(
        expanded.replace("## Context", "## Context\n\nWhy"),
        type,
        lookup
      )
    ).toBe(false)
    expect(
      isPristineTypeBody(
        expanded.replace("- [ ] Reviewed", "- [x] Reviewed"),
        type,
        lookup
      )
    ).toBe(false)
    expect(isPristineTypeBody("", type, lookup)).toBe(false)
  })
})
