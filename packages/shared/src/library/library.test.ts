import * as Schema from "effect/Schema"
import { describe, expect, it } from "vitest"

import { BlockDraft, Library } from "../schemas/Library"
import { formatTicketBlock } from "../ticketBlocks"
import { BUILTIN_BLOCKS } from "./gallery"
import {
  EMPTY_LAYER,
  GALLERY_LAYER,
  blockLookupFor,
  blockMatchesDefinition,
  galleryBlocksFor,
  type Layer,
  mergeChecklistTicks,
  resolveLibrary,
  resolveSyncedBlocks
} from "./library"

const blockDraft = Schema.decodeUnknownSync(BlockDraft)
const isLibrary = Schema.is(Library)

const layer = (overrides: Partial<Layer>): Layer => ({
  ...EMPTY_LAYER,
  ...overrides
})

const adoptedAll = resolveLibrary({ org: GALLERY_LAYER, project: null }, false)
const lookup = blockLookupFor(adoptedAll)

const blockOf = (library: Library, key: string) =>
  library.blocks.find((block) => block.key === key)

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
      false
    )

    expect(empty.blocks).toEqual([])
    expect(isLibrary(empty)).toBe(true)
  })

  it("serves adopted entries from the layer that holds their file", () => {
    expect(adoptedAll.blocks).toHaveLength(16)
    expect(
      adoptedAll.blocks.every(
        (block) => block.origin === "org" && block.shadows === null
      )
    ).toBe(true)
    expect(blockOf(adoptedAll, "definition-of-done")?.sync).toBe(true)
  })

  it("lets a project file shadow the org one", () => {
    const library = resolveLibrary(
      {
        org: layer({ blocks: [orgDone] }),
        project: layer({ blocks: [projectDone] })
      },
      true
    )
    const orgOnly = resolveLibrary(
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
    const library = resolveLibrary(
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
    const library = resolveLibrary(
      {
        org: layer({ hiddenBlocks: ["ghost"] }),
        project: layer({ hiddenBlocks: ["notes"] })
      },
      false
    )

    expect(library.blocks).toEqual([])
  })
})

describe("gallery", () => {
  it("offers every built-in block until it is adopted", () => {
    const empty = resolveLibrary({ org: EMPTY_LAYER, project: null }, false)
    expect(galleryBlocksFor(empty)).toEqual(BUILTIN_BLOCKS)
    expect(galleryBlocksFor(adoptedAll)).toEqual([])
  })

  it("keeps a hidden key out of the gallery", () => {
    const library = resolveLibrary(
      {
        org: layer({ blocks: [orgDone] }),
        project: layer({ hiddenBlocks: ["definition-of-done"] })
      },
      false
    )
    expect(galleryBlocksFor(library).map((block) => block.key)).not.toContain(
      "definition-of-done"
    )
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
