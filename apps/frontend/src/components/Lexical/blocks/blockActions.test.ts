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
import { IS_APPLE } from "@lexical/utils"
import {
  BUILTIN_BLOCKS,
  blockMatchesDefinition,
  formatTicketBlock,
  restoreDefinitionHints,
  stripHints
} from "@pp/shared"
import {
  $getRoot,
  $getSelection,
  $isRangeSelection,
  HISTORY_PUSH_TAG,
  KEY_BACKSPACE_COMMAND,
  KEY_DOWN_COMMAND,
  UNDO_COMMAND,
  defineExtension,
  type LexicalCommand,
  type LexicalEditor,
  type LexicalNode
} from "lexical"
import { describe, expect, it, vi } from "vitest"

import { BUILTIN_LIBRARY, lookupFor } from "@/components/blocks/blockChrome"

import { MARKDOWN_TRANSFORMERS } from "../../LexicalEditor"
import { TicketBlockExtension } from "../TicketBlockExtension"
import { $isTicketBlockNode } from "../TicketBlockNode"
import {
  $blankBlockAtCaret,
  $blockMarkdown,
  $duplicateBlock,
  $moveBlock,
  $moveBlockTo,
  $removeBlock,
  $resetBlock,
  $topLevelBlocks,
  $unwrapBlock,
  type TopLevelBlockNode
} from "./blockCommands"
import {
  registerBlockKeyboard,
  type BlockKeyboardHandlers
} from "./blockKeyboard"
import { $blockMenuModel } from "./blockMenuModel"
import {
  $createSyncedBlockNode,
  $isSyncedBlockNode,
  SyncedBlockExtension
} from "./SyncedBlockNode"

const lookup = lookupFor(BUILTIN_LIBRARY)

const definitionOf = (key: string) => {
  const definition = lookup(key)
  if (definition === undefined) throw new Error(`no block ${key}`)
  return definition
}

const block = (key: string, content = stripHints(definitionOf(key).content)) =>
  formatTicketBlock(key, content)

const BODY = [
  "Intro.",
  block("acceptance-criteria"),
  "Between.",
  block("notes", "## Notes\n\nSome notes.")
].join("\n\n")

function editorWith(markdown: string): LexicalEditor {
  const editor = buildEditorFromExtensions(
    defineExtension({
      name: "block-actions-test",
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

const run = (editor: LexicalEditor, fn: () => void) =>
  editor.update(fn, { discrete: true, tag: HISTORY_PUSH_TAG })

const markdown = (editor: LexicalEditor) =>
  editor
    .getEditorState()
    .read(() => $convertToMarkdownString(MARKDOWN_TRANSFORMERS))

const describeNode = (node: LexicalNode): string =>
  $isTicketBlockNode(node) || $isSyncedBlockNode(node)
    ? `block:${node.getBlockType()}`
    : node.getTextContent().trim() === ""
      ? "blank"
      : `text:${node.getTextContent()}`

const outline = (editor: LexicalEditor): ReadonlyArray<string> =>
  editor.getEditorState().read(() => $getRoot().getChildren().map(describeNode))

const $blockOf = (key: string): TopLevelBlockNode => {
  const node = $topLevelBlocks().find(
    (candidate) => candidate.getBlockType() === key
  )
  if (node === undefined) throw new Error(`no ${key} in editor`)
  return node
}

const $caretAtStartOf = (key: string) => {
  const node = $blockOf(key)
  if (!$isTicketBlockNode(node)) throw new Error("not a copy")
  node.selectStart()
}

describe("$moveBlock", () => {
  it("moves a block up past a paragraph and then past a block", () => {
    const editor = editorWith(BODY)
    run(editor, () => {
      $moveBlock($blockOf("notes"), "up")
    })
    expect(outline(editor)).toEqual([
      "text:Intro.",
      "block:acceptance-criteria",
      "block:notes",
      "text:Between.",
      "blank"
    ])
    run(editor, () => {
      $moveBlock($blockOf("notes"), "up")
    })
    expect(outline(editor).slice(0, 3)).toEqual([
      "text:Intro.",
      "block:notes",
      "block:acceptance-criteria"
    ])
  })

  it("moves a block down past a paragraph and stops at the trailing line", () => {
    const editor = editorWith(BODY)
    run(editor, () => {
      $moveBlock($blockOf("acceptance-criteria"), "down")
    })
    expect(outline(editor).slice(0, 3)).toEqual([
      "text:Intro.",
      "text:Between.",
      "block:acceptance-criteria"
    ])
    let neighbour: LexicalNode | null = null
    run(editor, () => {
      $moveBlock($blockOf("notes"), "down")
      neighbour = $moveBlock($blockOf("notes"), "down")
    })
    expect(neighbour).toBeNull()
    expect(outline(editor).at(-1)).toBe("blank")
  })
})

describe("$moveBlockTo", () => {
  it("drops a block before a target and ignores a drop onto itself", () => {
    const editor = editorWith(BODY)
    let moved = true
    run(editor, () => {
      const notes = $blockOf("notes")
      moved = $moveBlockTo(notes, notes, "before")
      const intro = $getRoot().getFirstChild()
      if (intro !== null) $moveBlockTo(notes, intro, "before")
    })
    expect(moved).toBe(false)
    expect(outline(editor)[0]).toBe("block:notes")
  })
})

describe("block edits", () => {
  it("duplicates a block right after itself", () => {
    const editor = editorWith(BODY)
    run(editor, () => {
      $duplicateBlock($blockOf("notes"))
    })
    const body = markdown(editor)
    const copy = block("notes", "## Notes\n\nSome notes.")
    expect(body.split(copy)).toHaveLength(3)
  })

  it("duplicates a synced block as another synced block", () => {
    const synced = formatTicketBlock(
      "definition-of-done",
      stripHints(definitionOf("definition-of-done").content),
      { sync: true }
    )
    const editor = editorWith(`Intro.\n\n${synced}`)
    run(editor, () => {
      $duplicateBlock($blockOf("definition-of-done"))
    })
    const kinds = editor
      .getEditorState()
      .read(() => $topLevelBlocks().map((node) => node.getType()))
    expect(kinds).toEqual(["synced-block", "synced-block"])
  })

  it("removes a block and keeps the caret in the document", () => {
    const editor = editorWith(BODY)
    run(editor, () => {
      $caretAtStartOf("notes")
      $removeBlock($blockOf("notes"))
    })
    expect(outline(editor)).not.toContain("block:notes")
    const caret = editor.getEditorState().read(() => {
      const selection = $getSelection()
      return $isRangeSelection(selection)
        ? selection.anchor.getNode().getTextContent()
        : null
    })
    expect(caret).toBe("Between.")
  })

  it("removes the wrapper and keeps the text as loose markdown", () => {
    const editor = editorWith(BODY)
    run(editor, () => {
      const notes = $blockOf("notes")
      $unwrapBlock(notes, "", MARKDOWN_TRANSFORMERS)
    })
    expect(outline(editor)).not.toContain("block:notes")
    expect(markdown(editor)).toContain("## Notes\n\nSome notes.")
    expect(markdown(editor)).not.toContain('<block type="notes">')
  })

  it("removes a synced wrapper by writing out its content", () => {
    const content = stripHints(definitionOf("definition-of-done").content)
    const editor = editorWith(
      formatTicketBlock("definition-of-done", content, { sync: true })
    )
    run(editor, () => {
      $unwrapBlock(
        $blockOf("definition-of-done"),
        content,
        MARKDOWN_TRANSFORMERS
      )
    })
    expect(outline(editor)).not.toContain("block:definition-of-done")
    expect(markdown(editor)).toContain("## Definition of done")
  })

  it("resets an edited copy to its definition", () => {
    const definition = definitionOf("notes")
    const editor = editorWith(BODY)
    run(editor, () => {
      const notes = $blockOf("notes")
      if ($isTicketBlockNode(notes))
        $resetBlock(notes, definition, MARKDOWN_TRANSFORMERS)
    })
    const content = editor.getEditorState().read(() => {
      const notes = $blockOf("notes")
      return $isTicketBlockNode(notes)
        ? $blockMarkdown(notes, MARKDOWN_TRANSFORMERS)
        : ""
    })
    expect(blockMatchesDefinition(content, definition)).toBe(true)
    expect(markdown(editor)).not.toContain("Some notes.")
  })

  it.each([
    [
      "move",
      () => {
        $moveBlock($blockOf("notes"), "up")
      }
    ],
    [
      "duplicate",
      () => {
        $duplicateBlock($blockOf("notes"))
      }
    ],
    ["remove", () => $removeBlock($blockOf("notes"))],
    [
      "unwrap",
      () => {
        $unwrapBlock($blockOf("notes"), "", MARKDOWN_TRANSFORMERS)
      }
    ],
    [
      "reset",
      () => {
        const notes = $blockOf("notes")
        if ($isTicketBlockNode(notes))
          $resetBlock(notes, definitionOf("notes"), MARKDOWN_TRANSFORMERS)
      }
    ]
  ])("undoes %s in a single step", async (_name, action) => {
    const editor = editorWith(BODY)
    run(editor, () => $caretAtStartOf("acceptance-criteria"))
    const before = markdown(editor)
    run(editor, action)
    expect(markdown(editor)).not.toBe(before)
    editor.dispatchCommand(UNDO_COMMAND, undefined)
    await Promise.resolve()
    expect(markdown(editor)).toBe(before)
  })
})

const shortcut = (key: string, shiftKey: boolean) =>
  new KeyboardEvent("keydown", {
    key,
    shiftKey,
    metaKey: IS_APPLE,
    ctrlKey: !IS_APPLE,
    cancelable: true
  })

const dispatch = <P>(
  editor: LexicalEditor,
  command: LexicalCommand<P>,
  payload: P
) =>
  editor.update(
    () => {
      editor.dispatchCommand(command, payload)
    },
    { discrete: true }
  )

const keyboardEditor = (markdownBody: string) => {
  const editor = editorWith(markdownBody)
  const handlers = {
    transformers: MARKDOWN_TRANSFORMERS,
    onMoved: vi.fn<BlockKeyboardHandlers["onMoved"]>(),
    onRemoved: vi.fn<BlockKeyboardHandlers["onRemoved"]>(),
    onOpenMenu: vi.fn<BlockKeyboardHandlers["onOpenMenu"]>()
  }
  registerBlockKeyboard(editor, handlers)
  return { editor, handlers }
}

describe("a synced block pasted into a block", () => {
  it("moves out after the block and keeps its sync", () => {
    const editor = editorWith(block("notes", "## Notes\n\nhello world"))
    run(editor, () => {
      const notes = $blockOf("notes")
      if (!$isTicketBlockNode(notes)) throw new Error("notes is not a copy")
      notes.append($createSyncedBlockNode("steps", "## Steps\n\n- [x] one"))
    })

    expect(outline(editor)).toEqual(["block:notes", "block:steps", "blank"])
    expect(markdown(editor).trim()).toBe(
      [
        block("notes", "## Notes\n\nhello world"),
        formatTicketBlock("steps", "## Steps\n\n- [x] one", { sync: true })
      ].join("\n\n")
    )
  })
})

describe("registerBlockKeyboard", () => {
  it("moves the caret's block with the move shortcut", () => {
    const { editor, handlers } = keyboardEditor(BODY)
    run(editor, () => $caretAtStartOf("notes"))
    const event = shortcut("ArrowUp", true)
    dispatch(editor, KEY_DOWN_COMMAND, event)
    expect(event.defaultPrevented).toBe(true)
    expect(outline(editor).slice(1, 3)).toEqual([
      "block:acceptance-criteria",
      "block:notes"
    ])
    expect(handlers.onMoved).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      "up"
    )
  })

  it("ignores the move shortcut outside a block", () => {
    const { editor } = keyboardEditor(BODY)
    run(editor, () => $getRoot().getFirstChildOrThrow().selectStart())
    const before = outline(editor)
    dispatch(editor, KEY_DOWN_COMMAND, shortcut("ArrowDown", true))
    expect(outline(editor)).toEqual(before)
  })

  it("opens the menu for the caret's block", () => {
    const { editor, handlers } = keyboardEditor(BODY)
    run(editor, () => $caretAtStartOf("notes"))
    dispatch(editor, KEY_DOWN_COMMAND, shortcut(".", false))
    expect(handlers.onOpenMenu).toHaveBeenCalledTimes(1)
  })

  it("removes a blank block on backspace at its first line", () => {
    const { editor, handlers } = keyboardEditor(
      `Intro.\n\n${block("notes", "## Notes")}`
    )
    run(editor, () => $caretAtStartOf("notes"))
    dispatch(
      editor,
      KEY_BACKSPACE_COMMAND,
      new KeyboardEvent("keydown", { key: "Backspace" })
    )
    expect(outline(editor)).not.toContain("block:notes")
    expect(handlers.onRemoved).toHaveBeenCalledWith("notes")
  })

  it("only treats a blank block with the caret at its start as removable", () => {
    const editor = editorWith(
      `${BODY}\n\n${block("release-notes", "## Release notes")}`
    )
    const removable = (select: () => void) => {
      run(editor, select)
      return editor
        .getEditorState()
        .read(() => $blankBlockAtCaret(MARKDOWN_TRANSFORMERS) !== null)
    }
    expect(removable(() => $caretAtStartOf("notes"))).toBe(false)
    expect(removable(() => $caretAtStartOf("release-notes"))).toBe(true)
    expect(removable(() => $blockOf("release-notes").selectEnd())).toBe(false)
  })
})

describe("$blockMenuModel", () => {
  const modelFor = (editor: LexicalEditor, key: string, canEdit = false) =>
    editor.getEditorState().read(() =>
      $blockMenuModel($blockOf(key), {
        lookup,
        transformers: MARKDOWN_TRANSFORMERS,
        blocks: {
          canEdit: { org: canEdit, project: canEdit },
          onMakeDefinition: () => {}
        }
      })
    )

  it("reports whether a copy matches its definition", () => {
    const editor = editorWith(BODY)
    expect(modelFor(editor, "acceptance-criteria").definition).toBe("matches")
    expect(modelFor(editor, "notes").definition).toBe("edited")
    expect(modelFor(editor, "notes").subtitle).toBe("Edited")
  })

  it("resets a copy with a definition to that definition", () => {
    const editor = editorWith(BODY)
    expect(modelFor(editor, "notes").resetsTo).toBe("definition")
  })

  it("offers make-definition only to editors of the layer", () => {
    const editor = editorWith(BODY)
    expect(modelFor(editor, "notes").definitionTarget).toBeNull()
    expect(modelFor(editor, "notes", true).definitionTarget?.key).toBe("notes")
  })

  it("knows when a block can't move further", () => {
    const editor = editorWith(`${block("notes")}\n\nAfter.`)
    const model = modelFor(editor, "notes")
    expect(model.canMoveUp).toBe(false)
    expect(model.canMoveDown).toBe(true)
  })
})

describe("making a ticket block the definition", () => {
  const exported = (markdown: string, key: string) =>
    editorWith(markdown)
      .getEditorState()
      .read(() => {
        const node = $blockOf(key)
        if (!$isTicketBlockNode(node)) throw new Error(`no copy ${key}`)
        return $blockMarkdown(node, MARKDOWN_TRANSFORMERS)
      })

  it("keeps every hint of a block the ticket left untouched", () => {
    for (const definition of BUILTIN_BLOCKS.filter((draft) => !draft.sync)) {
      const content = exported(block(definition.key), definition.key)
      expect(
        restoreDefinitionHints(content, definition.content).trimEnd(),
        definition.key
      ).toBe(definition.content)
    }
  })

  it("keeps the hints of lines still empty next to filled ones", () => {
    const definition = definitionOf("rollout-plan")
    const content = exported(
      block(
        "rollout-plan",
        "## Rollout\n\n- [ ] Flag behind mobile-retry\n- [ ] \n- [ ] "
      ),
      "rollout-plan"
    )
    expect(restoreDefinitionHints(content, definition.content).trimEnd()).toBe(
      [
        "## Rollout",
        "",
        "- [ ] Flag behind mobile-retry",
        "- [ ] {{How we'll watch it: metric, log or dashboard}}",
        "- [ ] {{How to roll back}}"
      ].join("\n")
    )
  })
})
