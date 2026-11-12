import { CodeExtension } from "@lexical/code"
import {
  HorizontalRuleExtension,
  buildEditorFromExtensions
} from "@lexical/extension"
import { HistoryExtension } from "@lexical/history"
import { LinkExtension } from "@lexical/link"
import { CheckListExtension, ListExtension } from "@lexical/list"
import {
  $convertFromMarkdownString,
  $convertToMarkdownString
} from "@lexical/markdown"
import { RichTextExtension } from "@lexical/rich-text"
import { TableExtension } from "@lexical/table"
import {
  BlockKey,
  expandType,
  typeFor,
  type BlockDefinition,
  type Library,
  type TypeDefinition,
  TypeKey
} from "@pp/shared"
import {
  HISTORY_PUSH_TAG,
  UNDO_COMMAND,
  defineExtension,
  type LexicalEditor
} from "lexical"
import { describe, expect, it } from "vitest"

import { MARKDOWN_TRANSFORMERS } from "@/features/editor/components/LexicalEditor"
import { SyncedBlockExtension } from "@/features/editor/lexical/blocks/SyncedBlockNode"
import { registerSyncedBlocks } from "@/features/editor/lexical/blocks/syncedBlocks"
import { TicketBlockExtension } from "@/features/editor/lexical/TicketBlockExtension"
import { BUILTIN_LIBRARY, lookupFor } from "@/features/editor/lib/blockChrome"

import {
  $replaceWithTemplate,
  $restoreBody,
  $startFromTemplate,
  templateSwap
} from "./descriptionTemplates"

const lookup = lookupFor(BUILTIN_LIBRARY)
const context = { transformers: MARKDOWN_TRANSFORMERS, lookup }

const template = (key: string): TypeDefinition => {
  const found = BUILTIN_LIBRARY.types.find((entry) => entry.key === key)
  if (found === undefined) throw new Error(`no template ${key}`)
  return found
}

const expanded = (key: string): string => expandType(template(key), lookup)

function editorWith(markdown: string): LexicalEditor {
  const editor = buildEditorFromExtensions(
    defineExtension({
      name: "description-templates-test",
      dependencies: [
        RichTextExtension,
        HistoryExtension,
        ListExtension,
        CheckListExtension,
        CodeExtension,
        LinkExtension,
        HorizontalRuleExtension,
        TableExtension,
        TicketBlockExtension,
        SyncedBlockExtension
      ],
      $initialEditorState: () => {
        $convertFromMarkdownString(markdown, MARKDOWN_TRANSFORMERS)
      },
      onError: (error) => {
        throw error
      }
    })
  )
  editor.update(() => {}, { discrete: true })
  return editor
}

const bodyOf = (editor: LexicalEditor): string =>
  editor
    .getEditorState()
    .read(() => $convertToMarkdownString(MARKDOWN_TRANSFORMERS))

const run = (editor: LexicalEditor, fn: () => void) =>
  editor.update(fn, { discrete: true, tag: HISTORY_PUSH_TAG })

describe("templateSwap", () => {
  it("swaps a body that is exactly the old type's default", () => {
    const next = templateSwap({
      library: BUILTIN_LIBRARY,
      body: expanded("bug"),
      from: TypeKey.make("bug"),
      to: TypeKey.make("feat")
    })
    expect(next?.key).toBe("feat")
  })

  it("ignores whitespace the editor adds or drops", () => {
    const next = templateSwap({
      library: BUILTIN_LIBRARY,
      body: `\n${expanded("bug").replaceAll("\n\n", "\n\n\n")}\n\n`,
      from: TypeKey.make("bug"),
      to: TypeKey.make("feat")
    })
    expect(next?.key).toBe("feat")
  })

  it("leaves an edited body alone", () => {
    const next = templateSwap({
      library: BUILTIN_LIBRARY,
      body: expanded("bug").replace("**Expected:**", "**Expected:** ok"),
      from: TypeKey.make("bug"),
      to: TypeKey.make("feat")
    })
    expect(next).toBeNull()
  })

  it("fills an empty body with the new type's default", () => {
    const next = templateSwap({
      library: BUILTIN_LIBRARY,
      body: "",
      from: null,
      to: TypeKey.make("feat")
    })
    expect(next?.key).toBe("feat")
  })

  it("leaves an empty body alone when the new type has no default", () => {
    expect(
      templateSwap({
        library: BUILTIN_LIBRARY,
        body: "",
        from: TypeKey.make("bug"),
        to: null
      })
    ).toBeNull()
  })

  it("does nothing when the old type's body is left behind but the new type defaults to blank", () => {
    expect(
      templateSwap({
        library: BUILTIN_LIBRARY,
        body: expanded("bug"),
        from: TypeKey.make("bug"),
        to: null
      })
    ).toBeNull()
  })

  it("follows a project's own copy of a type", () => {
    const library: Library = {
      ...BUILTIN_LIBRARY,
      types: BUILTIN_LIBRARY.types.map((entry) =>
        entry.key === "feat"
          ? { ...entry, body: template("spike").body, origin: "project" }
          : entry
      )
    }
    expect(
      templateSwap({
        library,
        body: expanded("bug"),
        from: TypeKey.make("bug"),
        to: TypeKey.make("feat")
      })?.body
    ).toBe(template("spike").body)
  })
})

describe("$startFromTemplate", () => {
  it("fills an empty body with the template in one undo step", async () => {
    const editor = editorWith("")
    run(editor, () => $startFromTemplate(expanded("bug"), context))
    expect(bodyOf(editor)).toContain('<block type="steps-to-reproduce">')
    expect(bodyOf(editor)).toContain('<block type="environment">')
    editor.dispatchCommand(UNDO_COMMAND, undefined)
    await Promise.resolve()
    expect(bodyOf(editor).trim()).toBe("")
  })

  it("stays pristine through the editor, so a type change can swap it", () => {
    const editor = editorWith("")
    run(editor, () => $startFromTemplate(expanded("bug"), context))
    const next = templateSwap({
      library: BUILTIN_LIBRARY,
      body: bodyOf(editor),
      from: TypeKey.make("bug"),
      to: TypeKey.make("feat")
    })
    expect(next?.key).toBe("feat")
  })
})

describe("$replaceWithTemplate and $restoreBody", () => {
  it("swaps the whole body and restores the previous one", async () => {
    const editor = editorWith(expanded("bug"))
    const previous = bodyOf(editor)
    run(editor, () => $replaceWithTemplate(expanded("chore"), context))
    const swapped = bodyOf(editor)
    expect(swapped).not.toContain('<block type="steps-to-reproduce">')
    expect(
      templateSwap({
        library: BUILTIN_LIBRARY,
        body: swapped,
        from: TypeKey.make("chore"),
        to: TypeKey.make("bug")
      })?.key
    ).toBe("bug")
    run(editor, () => $restoreBody(previous, MARKDOWN_TRANSFORMERS))
    expect(bodyOf(editor).trimEnd()).toBe(previous.trimEnd())
    editor.dispatchCommand(UNDO_COMMAND, undefined)
    await Promise.resolve()
    expect(bodyOf(editor)).toBe(swapped)
  })
})

const RELEASE_CHECKS: BlockDefinition = {
  ...BUILTIN_LIBRARY.blocks[0],
  key: BlockKey.make("release-checks"),
  name: "Release checks",
  sync: true,
  content: "## Release checks\n\n- [ ] {{First check}}\n- [ ] Smoke test",
  hidden: false
}

const RELEASE_CHORE: TypeDefinition = {
  ...template("chore"),
  name: "Release chore",
  body: '<block type="context">\n\n</block>\n\n<block type="release-checks" sync>\n\n</block>\n\nNotes: {{anything else}}'
}

const chainLibrary: Library = {
  ...BUILTIN_LIBRARY,
  blocks: [...BUILTIN_LIBRARY.blocks, RELEASE_CHECKS],
  types: BUILTIN_LIBRARY.types.map((entry) =>
    entry.key === RELEASE_CHORE.key ? RELEASE_CHORE : entry
  )
}
const chainLookup = lookupFor(chainLibrary)
const chainContext = {
  transformers: MARKDOWN_TRANSFORMERS,
  lookup: chainLookup
}

function liveEditor(markdown: string): LexicalEditor {
  const editor = editorWith(markdown)
  registerSyncedBlocks(editor, chainLookup, MARKDOWN_TRANSFORMERS, () => {})
  editor.update(() => {}, { discrete: true })
  return editor
}

const defaultBody = (type: string): string => {
  const found = typeFor(chainLibrary, type)
  if (found === null) throw new Error(`no default for ${type}`)
  return expandType(found, chainLookup)
}

const changeType = (
  editor: LexicalEditor,
  from: string | null,
  to: string | null
): string | null => {
  const next = templateSwap({
    library: chainLibrary,
    body: bodyOf(editor),
    from: from === null ? null : TypeKey.make(from),
    to: to === null ? null : TypeKey.make(to)
  })
  if (next !== null)
    run(editor, () =>
      $replaceWithTemplate(expandType(next, chainLookup), chainContext)
    )
  return next?.key ?? null
}

describe("type swap across repeated changes", () => {
  it("swaps on every change of a feat, bug, chore, feat chain", () => {
    const editor = liveEditor(defaultBody("feat"))
    expect(changeType(editor, "feat", "bug")).toBe("bug")
    expect(changeType(editor, "bug", "chore")).toBe("chore")
    expect(changeType(editor, "chore", "feat")).toBe("feat")
    expect(changeType(editor, "feat", "bug")).toBe("bug")
  })

  it("keeps swapping a synced block with hints and checklists", () => {
    const editor = liveEditor("")
    run(editor, () => $startFromTemplate(defaultBody("chore"), chainContext))
    expect(bodyOf(editor)).toContain('<block type="release-checks" sync>')
    expect(changeType(editor, "chore", "bug")).toBe("bug")
    expect(changeType(editor, "bug", "chore")).toBe("chore")
    expect(changeType(editor, "chore", "feat")).toBe("feat")
  })

  it("keeps swapping after a reload of the saved body", () => {
    const first = liveEditor(defaultBody("feat"))
    changeType(first, "feat", "chore")
    const reloaded = liveEditor(bodyOf(first))
    expect(changeType(reloaded, "chore", "bug")).toBe("bug")
  })

  it("swaps again after Undo restored the previous type's body", () => {
    const editor = liveEditor(defaultBody("feat"))
    const previous = bodyOf(editor)
    changeType(editor, "feat", "bug")
    run(editor, () => $restoreBody(previous, MARKDOWN_TRANSFORMERS))
    expect(changeType(editor, "bug", "chore")).toBe("chore")
    expect(changeType(editor, "chore", "feat")).toBe("feat")
  })

  it("swapping back after Undo keeps the restored body", () => {
    const editor = liveEditor(defaultBody("feat"))
    const previous = bodyOf(editor)
    changeType(editor, "feat", "bug")
    run(editor, () => $restoreBody(previous, MARKDOWN_TRANSFORMERS))
    expect(changeType(editor, "bug", "feat")).toBeNull()
    expect(bodyOf(editor).trimEnd()).toBe(previous.trimEnd())
  })

  it("swaps again after passing through a blank type", () => {
    const editor = liveEditor(defaultBody("feat"))
    expect(changeType(editor, "feat", null)).toBeNull()
    expect(changeType(editor, null, "bug")).toBe("bug")
  })

  it("swaps a body started from a template that is not the default", () => {
    const editor = liveEditor("")
    run(editor, () =>
      $startFromTemplate(
        expandType(template("spike"), chainLookup),
        chainContext
      )
    )
    expect(changeType(editor, "feat", "bug")).toBe("bug")
  })

  it("swaps a body that kept its hints, as agents create it", () => {
    const withHints = defaultBody("bug").replace(
      "**Expected:**",
      "**Expected:** {{what should happen}}"
    )
    expect(
      templateSwap({
        library: chainLibrary,
        body: withHints,
        from: TypeKey.make("bug"),
        to: TypeKey.make("feat")
      })?.key
    ).toBe("feat")
  })

  it("leaves the body alone once it is edited", () => {
    const editor = liveEditor(defaultBody("feat"))
    changeType(editor, "feat", "bug")
    const edited = bodyOf(editor).replace("**Expected:**", "**Expected:** ok")
    const typed = liveEditor(edited)
    expect(changeType(typed, "bug", "chore")).toBeNull()
    expect(bodyOf(typed)).toContain("**Expected:** ok")
  })
})
