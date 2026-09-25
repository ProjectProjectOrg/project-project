import { buildEditorFromExtensions } from "@lexical/extension"
import { HistoryExtension } from "@lexical/history"
import { CheckListExtension, ListExtension } from "@lexical/list"
import {
  $convertFromMarkdownString,
  $convertToMarkdownString
} from "@lexical/markdown"
import { RichTextExtension } from "@lexical/rich-text"
import { $getNearestBlockElementAncestorOrThrow } from "@lexical/utils"
import { formatTicketBlock, stripHints } from "@pp/shared"
import {
  $createTextNode,
  $getRoot,
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  $isTextNode,
  CAN_UNDO_COMMAND,
  COMMAND_PRIORITY_EDITOR,
  CONTROLLED_TEXT_INSERTION_COMMAND,
  KEY_TAB_COMMAND,
  defineExtension,
  type ElementNode,
  type LexicalEditor,
  type LexicalNode
} from "lexical"
import { afterEach, describe, expect, it } from "vitest"

import { BUILTIN_LIBRARY, lookupFor } from "@/components/blocks/blockChrome"

import { MARKDOWN_TRANSFORMERS } from "../../LexicalEditor"
import { TicketBlockExtension } from "../TicketBlockExtension"
import { registerBlockHints } from "./blockHints"

const lookup = lookupFor(BUILTIN_LIBRARY)

const pristine = (key: string): string => {
  const definition = lookup(key)
  if (definition === undefined) throw new Error(`no block ${key}`)
  return formatTicketBlock(key, stripHints(definition.content))
}

const cleanups: Array<() => void> = []

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup()
})

function mount(markdown: string): LexicalEditor {
  const editor = buildEditorFromExtensions(
    defineExtension({
      name: "block-hints-test",
      dependencies: [
        RichTextExtension,
        HistoryExtension,
        ListExtension,
        CheckListExtension,
        TicketBlockExtension
      ],
      $initialEditorState: () => {
        $convertFromMarkdownString(markdown, MARKDOWN_TRANSFORMERS)
      },
      onError: (error) => {
        throw error
      }
    })
  )
  const root = document.createElement("div")
  root.contentEditable = "true"
  document.body.append(root)
  editor.setRootElement(root)
  const unregister = registerBlockHints(editor, lookup)
  editor.update(() => {}, { discrete: true })
  cleanups.push(() => {
    unregister()
    editor.setRootElement(null)
    root.remove()
  })
  return editor
}

const hintsOf = (editor: LexicalEditor): ReadonlyArray<string> =>
  [
    ...(editor.getRootElement()?.querySelectorAll<HTMLElement>("[data-hint]") ??
      [])
  ].map(
    (element) =>
      `${element.tagName.toLowerCase()}${element.dataset.hintEmpty === undefined ? "+" : ""}:${element.dataset.hint}`
  )

const markdownOf = (editor: LexicalEditor): string =>
  editor.read(() => $convertToMarkdownString(MARKDOWN_TRANSFORMERS))

function elementAt(path: ReadonlyArray<number>): ElementNode {
  let node: LexicalNode | null = $getRoot()
  for (const index of path) {
    if (!$isElementNode(node)) throw new Error("no element")
    node = node.getChildAtIndex(index)
  }
  if (!$isElementNode(node)) throw new Error("no element")
  return node
}

const caretAt = (
  editor: LexicalEditor,
  path: ReadonlyArray<number>,
  offset?: number
) =>
  editor.update(
    () => {
      const element = elementAt(path)
      const text = element.getFirstChild()
      if (offset !== undefined && $isTextNode(text)) text.select(offset, offset)
      else element.selectEnd()
    },
    { discrete: true }
  )

const caretPath = (editor: LexicalEditor): ReadonlyArray<number> =>
  editor.read(() => {
    const selection = $getSelection()
    if (!$isRangeSelection(selection)) return []
    const path: Array<number> = []
    let node: LexicalNode | null = $getNearestBlockElementAncestorOrThrow(
      selection.anchor.getNode()
    )
    while (node !== null && node.getParent() !== null) {
      path.unshift(node.getIndexWithinParent())
      node = node.getParent()
    }
    return path
  })

const pressTab = (editor: LexicalEditor, shiftKey = false) => {
  const event = new KeyboardEvent("keydown", {
    key: "Tab",
    shiftKey,
    cancelable: true
  })
  const handled = editor.dispatchCommand(KEY_TAB_COMMAND, event)
  return { handled, prevented: event.defaultPrevented }
}

function setTextAt(
  editor: LexicalEditor,
  path: ReadonlyArray<number>,
  text: string
) {
  editor.update(
    () => {
      let node: LexicalNode | null = $getRoot()
      for (const index of path) {
        if (!$isElementNode(node)) throw new Error("no element")
        node = node.getChildAtIndex(index)
      }
      if (!$isElementNode(node)) throw new Error("no element")
      node.clear()
      if (text !== "") node.append($createTextNode(text))
    },
    { discrete: true }
  )
}

describe("block hints", () => {
  it("shows every hint of a pristine bug report", () => {
    const editor = mount(
      [
        pristine("steps-to-reproduce"),
        pristine("expected-vs-actual"),
        pristine("environment")
      ].join("\n\n")
    )
    expect(hintsOf(editor)).toEqual([
      "li:Where you start",
      "li:What you do",
      "li:What you see",
      "p:How often: always, sometimes, only when…",
      "p+: what should happen",
      "p+: what happens instead",
      "li+: production, staging or local",
      "li+: release or commit",
      "li+: OS, browser, device"
    ])
  })

  it("restores hint-only lines after a reload without changing the markdown", () => {
    const markdown = [pristine("context"), pristine("steps-to-reproduce")].join(
      "\n\n"
    )
    expect(markdown).not.toContain("{{")
    const editor = mount(markdown)
    expect(hintsOf(editor)).toEqual([
      "p:Why this ticket exists: the problem, what triggered it, links to earlier discussion.",
      "li:Where you start",
      "li:What you do",
      "li:What you see",
      "p:How often: always, sometimes, only when…"
    ])
    expect(markdownOf(editor).trimEnd()).toBe(markdown)
  })

  it("hides a hint once the element has text and brings it back when cleared", () => {
    const editor = mount(pristine("expected-vs-actual"))
    setTextAt(editor, [0, 1], "Expected: it works")
    expect(hintsOf(editor)).toEqual(["p+: what happens instead"])
    setTextAt(editor, [0, 1], "Expected:")
    expect(hintsOf(editor)).toEqual([
      "p+: what should happen",
      "p+: what happens instead"
    ])
  })

  it("adds no second space when the prefix already ends in one", () => {
    const editor = mount(pristine("expected-vs-actual"))
    setTextAt(editor, [0, 1], "Expected: ")
    expect(hintsOf(editor)[0]).toBe("p+:what should happen")
  })

  it("types plain text after a space when the caret ends a bare bold prefix", () => {
    const editor = mount(pristine("expected-vs-actual"))
    const type = (text: string) =>
      editor.update(
        () => {
          editor.dispatchCommand(CONTROLLED_TEXT_INSERTION_COMMAND, text)
        },
        { discrete: true }
      )
    editor.update(
      () => {
        const expected = $getRoot().getFirstChildOrThrow<ElementNode>()
        expected.getChildAtIndex<ElementNode>(1)!.selectEnd()
      },
      { discrete: true }
    )
    type("i")
    type("t")
    expect(markdownOf(editor)).toContain("**Expected:** it\n")
  })

  it("leaves typing alone once the prefix already has text", () => {
    const editor = mount(pristine("expected-vs-actual"))
    setTextAt(editor, [0, 1], "Expected: ok")
    editor.update(
      () => {
        const expected = $getRoot().getFirstChildOrThrow<ElementNode>()
        expected.getChildAtIndex<ElementNode>(1)!.selectEnd()
        editor.dispatchCommand(CONTROLLED_TEXT_INSERTION_COMMAND, "!")
      },
      { discrete: true }
    )
    expect(markdownOf(editor)).toContain("Expected: ok!\n")
  })

  it("stops at the first node that no longer lines up", () => {
    const editor = mount(
      formatTicketBlock(
        "steps-to-reproduce",
        "## Steps to reproduce\n\n- a bullet, not a number\n\n1. "
      )
    )
    expect(hintsOf(editor)).toEqual([])
  })

  it("gives a block without a definition no hints", () => {
    const editor = mount(formatTicketBlock("made-up", "## Made up\n\n1. "))
    expect(hintsOf(editor)).toEqual([])
  })

  it("never writes a hint into the markdown", () => {
    const editor = mount(pristine("acceptance-criteria"))
    expect(hintsOf(editor).length).toBeGreaterThan(0)
    expect(markdownOf(editor)).not.toContain("{{")
    expect(markdownOf(editor)).not.toContain("Given a starting state")
  })

  it("skips a ticked task item", () => {
    const editor = mount(
      formatTicketBlock(
        "acceptance-criteria",
        "## Acceptance criteria\n\n- [x] \n- [ ] "
      )
    )
    expect(hintsOf(editor)).toEqual(["li:Another observable outcome"])
  })
})

describe("hint tab navigation", () => {
  const bugReport = () =>
    mount(
      [pristine("steps-to-reproduce"), pristine("expected-vs-actual")].join(
        "\n\n"
      )
    )

  it("moves to the next hint slot, across blocks, and wraps", () => {
    const editor = bugReport()
    caretAt(editor, [0, 1, 0])
    expect(pressTab(editor)).toEqual({ handled: true, prevented: true })
    expect(caretPath(editor)).toEqual([0, 1, 1])
    caretAt(editor, [0, 2])
    pressTab(editor)
    expect(caretPath(editor)).toEqual([1, 1])
    pressTab(editor)
    expect(caretPath(editor)).toEqual([1, 2])
    pressTab(editor)
    expect(caretPath(editor)).toEqual([0, 1, 0])
  })

  it("moves back with Shift+Tab and wraps to the last slot", () => {
    const editor = bugReport()
    caretAt(editor, [0, 1, 0])
    pressTab(editor, true)
    expect(caretPath(editor)).toEqual([1, 2])
    pressTab(editor, true)
    expect(caretPath(editor)).toEqual([1, 1])
  })

  it("lands after the fixed prefix and types after a space", () => {
    const editor = bugReport()
    caretAt(editor, [0, 2])
    pressTab(editor)
    editor.update(
      () => {
        editor.dispatchCommand(CONTROLLED_TEXT_INSERTION_COMMAND, "ok")
      },
      { discrete: true }
    )
    expect(markdownOf(editor)).toContain("**Expected:** ok\n")
  })

  it("moves on from the end of a just-filled slot", () => {
    const editor = bugReport()
    setTextAt(editor, [0, 1, 0], "Sign in")
    caretAt(editor, [0, 1, 0])
    pressTab(editor)
    expect(caretPath(editor)).toEqual([0, 1, 1])
  })

  it("leaves Tab to list indent inside filled text", () => {
    const editor = bugReport()
    setTextAt(editor, [0, 1, 0], "Sign in")
    caretAt(editor, [0, 1, 0], 2)
    expect(pressTab(editor)).toEqual({ handled: false, prevented: false })
  })

  it("leaves Tab alone outside hint slots and with a single slot", () => {
    const editor = mount(
      [pristine("expected-vs-actual"), "plain text"].join("\n\n")
    )
    caretAt(editor, [0, 0])
    expect(pressTab(editor).handled).toBe(false)
    caretAt(editor, [1])
    expect(pressTab(editor).handled).toBe(false)

    const single = mount(
      formatTicketBlock(
        "acceptance-criteria",
        "## Acceptance criteria\n\n- [ ] "
      )
    )
    caretAt(single, [0, 1, 0])
    expect(pressTab(single).handled).toBe(false)
  })

  it("leaves Tab to an open slash query", () => {
    const editor = bugReport()
    setTextAt(editor, [0, 1, 0], "/bug")
    caretAt(editor, [0, 1, 0])
    expect(pressTab(editor).handled).toBe(false)
  })

  it("changes no content and adds no undo step", () => {
    const editor = bugReport()
    const before = markdownOf(editor)
    const canUndo: Array<boolean> = []
    cleanups.push(
      editor.registerCommand(
        CAN_UNDO_COMMAND,
        (payload) => {
          canUndo.push(payload)
          return false
        },
        COMMAND_PRIORITY_EDITOR
      )
    )
    caretAt(editor, [0, 1, 0])
    pressTab(editor)
    pressTab(editor)
    expect(markdownOf(editor)).toBe(before)
    expect(canUndo).not.toContain(true)
  })
})
