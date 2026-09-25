import { CodeNode } from "@lexical/code"
import { ListItemNode, ListNode } from "@lexical/list"
import { $convertToMarkdownString } from "@lexical/markdown"
import { LexicalComposer } from "@lexical/react/LexicalComposer"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import type { MenuRenderFn } from "@lexical/react/LexicalTypeaheadMenuPlugin"
import { HeadingNode } from "@lexical/rich-text"
import {
  BUILTIN_TEMPLATE_DEFAULTS,
  EMPTY_LAYER,
  GALLERY_LAYER,
  resolveLibrary,
  type Library,
  type TicketType
} from "@pp/shared"
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react"
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  KEY_ARROW_DOWN_COMMAND,
  KEY_ENTER_COMMAND,
  KEY_TAB_COMMAND,
  type LexicalEditor
} from "lexical"
import { afterEach, describe, expect, it, vi } from "vitest"

import { MARKDOWN_TRANSFORMERS } from "../../LexicalEditor"
import { TicketBlockNode } from "../TicketBlockNode"
import { slashTriggerMatch } from "./slashMenuItems"
import { OPEN_SLASH_MENU_COMMAND, SlashMenuPlugin } from "./SlashMenuPlugin"

vi.mock("@lexical/react/LexicalTypeaheadMenuPlugin", async (original) => {
  const actual =
    await original<typeof import("@lexical/react/LexicalTypeaheadMenuPlugin")>()
  const { useState } = await import("react")
  const anchorRef = { current: document.body }
  return {
    ...actual,
    LexicalTypeaheadMenuPlugin: ({
      triggerFn,
      onQueryChange,
      onSelectOption,
      options,
      menuRenderFn
    }: {
      triggerFn: (text: string) => { matchingString: string } | null
      onQueryChange: (query: string | null) => void
      onSelectOption: (
        option: unknown,
        node: null,
        close: () => void,
        query: string
      ) => void
      options: Array<InstanceType<typeof actual.MenuOption>>
      menuRenderFn: MenuRenderFn<InstanceType<typeof actual.MenuOption>>
    }) => {
      const [query, setQuery] = useState<string | null>(null)
      return (
        <div>
          <input
            aria-label="Slash query"
            onChange={(event) => {
              const next = triggerFn(event.target.value)?.matchingString ?? null
              setQuery(next)
              onQueryChange(next)
            }}
          />
          {query === null
            ? null
            : menuRenderFn(
                anchorRef,
                {
                  options,
                  selectedIndex: 0,
                  setHighlightedIndex: () => {},
                  selectOptionAndCleanUp: (option) =>
                    onSelectOption(option, null, () => {}, query)
                },
                query
              )}
        </div>
      )
    }
  }
})

class NoopResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.stubGlobal("ResizeObserver", NoopResizeObserver)
if (!("getAnimations" in Element.prototype))
  Object.assign(Element.prototype, { getAnimations: () => [] })
vi.stubGlobal("matchMedia", (query: string) => ({
  matches: false,
  media: query,
  addEventListener: () => {},
  removeEventListener: () => {}
}))

afterEach(() => {
  cleanup()
})

function CaptureEditor({
  onEditor
}: Readonly<{ onEditor: (editor: LexicalEditor) => void }>) {
  const [editor] = useLexicalComposerContext()
  onEditor(editor)
  return null
}

const type = (value: string) =>
  fireEvent.change(screen.getByLabelText("Slash query"), {
    target: { value }
  })

const GALLERY_LIBRARY: Library = resolveLibrary(
  { org: GALLERY_LAYER, project: null },
  { org: BUILTIN_TEMPLATE_DEFAULTS, project: null },
  false
)

const EMPTY_LIBRARY: Library = resolveLibrary(
  { org: EMPTY_LAYER, project: null },
  { org: {}, project: null },
  false
)

function renderMenu(
  ticketType: TicketType | null = "bug",
  library: Library = GALLERY_LIBRARY
) {
  let captured: LexicalEditor | null = null
  render(
    <LexicalComposer
      initialConfig={{
        namespace: "slash-menu-test",
        nodes: [CodeNode, HeadingNode, ListNode, ListItemNode, TicketBlockNode],
        editorState: () => {
          const line = $createParagraphNode().append($createTextNode("Intro"))
          $getRoot().append(line)
          line.selectEnd()
        },
        onError: (error) => {
          throw error
        }
      }}
    >
      <CaptureEditor
        onEditor={(editor) => {
          captured = editor
        }}
      />
      <SlashMenuPlugin
        library={library}
        ticketType={ticketType}
        transformers={MARKDOWN_TRANSFORMERS}
      />
    </LexicalComposer>
  )
  const editor = () => {
    if (captured === null) throw new Error("no editor")
    return captured
  }
  return { type, editor }
}

const pressTab = (editor: LexicalEditor, shiftKey = false) =>
  act(() => {
    editor.dispatchCommand(
      KEY_TAB_COMMAND,
      new KeyboardEvent("keydown", { key: "Tab", shiftKey })
    )
  })

const tabTexts = () =>
  screen.getAllByRole("tab").map((tab) => tab.textContent ?? "")

const selectedTab = () =>
  screen
    .getAllByRole("tab")
    .find((tab) => tab.getAttribute("aria-selected") === "true")?.textContent ??
  ""

const highlighted = () =>
  screen
    .getAllByRole("option")
    .find((option) => option.getAttribute("aria-selected") === "true")
    ?.textContent ?? ""

const groupNames = () =>
  screen
    .queryAllByRole("group")
    .map(
      (group) =>
        document.getElementById(group.getAttribute("aria-labelledby") ?? "")
          ?.textContent ?? null
    )

describe("slashTriggerMatch", () => {
  it("fires at the start of a line or after whitespace only", () => {
    expect(slashTriggerMatch("/")?.matchingString).toBe("")
    expect(slashTriggerMatch("Some text /acc")?.matchingString).toBe("acc")
    expect(slashTriggerMatch("and/or")).toBeNull()
    expect(slashTriggerMatch("/acc more")).toBeNull()
    expect(slashTriggerMatch("see /etc/hosts")).toBeNull()
  })
})

describe("SlashMenuPlugin", () => {
  it("puts markdown right after suggestions in the all tab", () => {
    const { type } = renderMenu()
    type("/")

    expect(groupNames()).toEqual([
      "Suggested",
      "Markdown",
      "Blocks",
      "Templates"
    ])
    const suggested = screen.getByRole("group", { name: "Suggested" })
    expect(suggested.textContent).toContain("Expected vs actual")
    expect(suggested.textContent).toContain("Bug report")
    expect(
      screen.getByRole("group", { name: "Templates" }).textContent
    ).toMatch(/^TemplatesBug report/)
  })

  it("shows every section tab with its count", () => {
    const { type } = renderMenu()
    type("/")

    const tabs = tabTexts()
    expect(tabs.map((tab) => tab.replace(/[\d]+$/, ""))).toEqual([
      "AllAll",
      "BlocksBlocks",
      "TemplatesTemplates",
      "MarkdownMarkdown"
    ])
    expect(tabs[3]).toMatch(/8$/)
    expect(selectedTab()).toContain("All")
  })

  it("cycles tabs with Tab and Shift+Tab", () => {
    const { type, editor } = renderMenu()
    type("/")

    pressTab(editor())
    expect(selectedTab()).toContain("Blocks")
    expect(groupNames()).toEqual(["Suggested", "Blocks"])

    pressTab(editor())
    pressTab(editor())
    expect(groupNames()).toEqual(["Markdown"])
    expect(screen.getByRole("option", { name: /Checklist/ })).toBeTruthy()

    pressTab(editor())
    expect(selectedTab()).toContain("All")

    pressTab(editor(), true)
    expect(selectedTab()).toContain("Markdown")
  })

  it("filters within the active tab", () => {
    const { type, editor } = renderMenu()
    type("/")
    pressTab(editor(), true)

    type("/acc")
    expect(screen.getByText("No blocks match '/acc'")).toBeTruthy()
    expect(tabTexts()[1]).toMatch(/1$/)

    type("/todo")
    expect(screen.getByRole("option", { name: /Checklist/ })).toBeTruthy()
  })

  it("switches tabs on click", () => {
    const { type } = renderMenu()
    type("/")

    fireEvent.click(screen.getAllByRole("tab")[2])
    expect(groupNames()).toEqual(["Templates"])
  })

  it("points at the gallery when the library has nothing yet", () => {
    const { type, editor } = renderMenu("bug", EMPTY_LIBRARY)
    type("/")

    expect(groupNames()).toEqual(["Markdown", "Blocks", "Templates"])
    expect(
      screen.getByRole("option", { name: /No blocks yet/ }).textContent
    ).toContain("Browse the gallery")
    expect(tabTexts()[1]).toMatch(/0$/)

    pressTab(editor())
    pressTab(editor())
    expect(
      screen.getByRole("option", { name: /No templates yet/ })
    ).toBeTruthy()
  })

  it("leaves out suggestions when the ticket has no type", () => {
    const { type } = renderMenu(null)
    type("/")

    expect(groupNames()).not.toContain("Suggested")
  })

  it("filters on name, key and description words", () => {
    const { type } = renderMenu()
    type("/acc")

    expect(groupNames()).toEqual(["Blocks"])
    expect(
      screen.getByRole("option", { name: /Acceptance criteria/ })
    ).toBeTruthy()

    type("/reproduce")
    expect(
      screen.getByRole("option", { name: /Steps to reproduce/ })
    ).toBeTruthy()

    type("/todo")
    expect(screen.getByRole("option", { name: /Checklist/ })).toBeTruthy()
  })

  it("puts what the query names ahead of description matches", () => {
    const { type } = renderMenu()
    type("/bug")

    const options = screen.getAllByRole("option")
    expect(options[0].textContent).toMatch("Bug report")
    expect(groupNames()[0]).toBe("Templates")
    expect(
      screen.getByRole("option", { name: /Steps to reproduce/ })
    ).toBeTruthy()
  })

  it("opens on templates only when asked for that section", () => {
    const { type, editor } = renderMenu()
    act(() => {
      editor().dispatchCommand(OPEN_SLASH_MENU_COMMAND, "templates")
    })
    type("/")

    expect(groupNames()).toEqual(["Templates"])
  })

  it("drops the preview pane when the content column is too narrow", () => {
    const width = window.innerWidth
    try {
      window.innerWidth = 600
      renderMenu()
      type("/")
      expect(document.querySelector("[data-slash-menu-preview]")).toBeNull()
      const menu = document.querySelector<HTMLElement>(
        "[data-slash-menu-frame] > [role=presentation]"
      )
      expect(Number.parseFloat(menu?.style.width ?? "")).toBeLessThanOrEqual(
        584
      )
    } finally {
      window.innerWidth = width
    }
  })

  it("shows the preview pane when the content column has room", () => {
    const width = window.innerWidth
    try {
      window.innerWidth = 1280
      renderMenu()
      type("/")
      expect(document.querySelector("[data-slash-menu-preview]")).not.toBeNull()
    } finally {
      window.innerWidth = width
    }
  })

  it("places the menu from the typed trigger, not from the typeahead anchor", () => {
    const width = window.innerWidth
    const text = document.createTextNode("/")
    const rect = { left: 120, right: 126, top: 300, bottom: 318, height: 18 }
    const range = {
      startContainer: text,
      startOffset: 1,
      cloneRange: () => ({
        setStart: () => {},
        setEnd: () => {},
        getBoundingClientRect: () => rect
      }),
      getBoundingClientRect: () => rect
    }
    const getSelection = vi
      .spyOn(window, "getSelection")
      .mockReturnValue({ rangeCount: 1, getRangeAt: () => range } as never)
    const anchor = vi
      .spyOn(document.body, "getBoundingClientRect")
      .mockReturnValue({ left: 40, top: 500, bottom: 520 } as DOMRect)
    try {
      window.innerWidth = 1280
      renderMenu()
      type("/")
      const menu = document.querySelector<HTMLElement>(
        "[data-slash-menu-frame] > [role=presentation]"
      )
      expect(menu?.className).toMatch(/\bfixed\b/)
      expect(menu?.style.left).toBe("120px")
      expect(menu?.style.top).toBe("296px")
    } finally {
      window.innerWidth = width
      getSelection.mockRestore()
      anchor.mockRestore()
    }
  })

  it("anchors to the slash's rect, not the wrapped query's, when the query wraps lines", () => {
    const width = window.innerWidth
    const text = document.createTextNode("/query")
    const slashRect = {
      left: 120,
      right: 126,
      top: 300,
      bottom: 318,
      height: 18
    }
    const wrappedRect = {
      left: 20,
      right: 340,
      top: 300,
      bottom: 336,
      height: 36
    }
    const range = {
      startContainer: text,
      startOffset: 6,
      cloneRange: () => ({
        setStart: () => {},
        setEnd: () => {},
        getBoundingClientRect: () => slashRect
      }),
      getBoundingClientRect: () => wrappedRect
    }
    const getSelection = vi
      .spyOn(window, "getSelection")
      .mockReturnValue({ rangeCount: 1, getRangeAt: () => range } as never)
    const anchor = vi
      .spyOn(document.body, "getBoundingClientRect")
      .mockReturnValue({ left: 40, top: 500, bottom: 520 } as DOMRect)
    try {
      window.innerWidth = 1280
      renderMenu()
      type("/query")
      const menu = document.querySelector<HTMLElement>(
        "[data-slash-menu-frame] > [role=presentation]"
      )
      expect(menu?.style.left).toBe("120px")
      expect(menu?.style.top).toBe("296px")
    } finally {
      window.innerWidth = width
      getSelection.mockRestore()
      anchor.mockRestore()
    }
  })

  it("says so when nothing matches", () => {
    const { type } = renderMenu()
    type("/zzz")

    expect(screen.getByText("No blocks match '/zzz'")).toBeTruthy()
    expect(screen.queryAllByRole("option")).toHaveLength(0)
  })

  it("marks synced blocks and how many blocks a template adds", () => {
    const { type } = renderMenu()
    type("/done")

    const done = screen.getByRole("option", { name: /Definition of done/ })
    expect(done.textContent).toContain("synced")
    expect(done.textContent).toContain("⌥↵ copy")

    type("/chore")
    expect(screen.getByRole("option", { name: /Chore/ }).textContent).toContain(
      "adds 2 blocks"
    )
  })

  it("inserts the chosen block into the editor", async () => {
    const { type, editor } = renderMenu()
    type("/acc")

    fireEvent.click(screen.getByRole("option", { name: /Acceptance criteria/ }))

    const markdown = () =>
      editor()
        .getEditorState()
        .read(() => $convertToMarkdownString(MARKDOWN_TRANSFORMERS))
    await waitFor(() =>
      expect(markdown()).toContain('<block type="acceptance-criteria">')
    )
    expect(markdown().startsWith("Intro")).toBe(true)
  })

  it("inserts a detached copy of a synced block on alt", async () => {
    const { type, editor } = renderMenu()
    type("/done")

    fireEvent.click(
      screen.getByRole("option", { name: /Definition of done/ }),
      { altKey: true }
    )

    await waitFor(() =>
      expect(
        editor()
          .getEditorState()
          .read(() => $convertToMarkdownString(MARKDOWN_TRANSFORMERS))
      ).toContain('<block type="definition-of-done">\n\n## Definition of done')
    )
  })

  it("moves the highlight with the arrows and inserts on Enter", async () => {
    const { type, editor } = renderMenu()
    type("/checkl")

    await waitFor(() => expect(highlighted()).toContain("Checklist"))

    type("/")
    await waitFor(() => expect(highlighted()).not.toBe(""))
    const first = highlighted()
    act(() => {
      editor().dispatchCommand(
        KEY_ARROW_DOWN_COMMAND,
        new KeyboardEvent("keydown", { key: "ArrowDown" })
      )
    })
    expect(highlighted()).not.toBe(first)

    type("/acc")
    await waitFor(() => expect(highlighted()).toContain("Acceptance criteria"))
    act(() => {
      editor().dispatchCommand(
        KEY_ENTER_COMMAND,
        new KeyboardEvent("keydown", { key: "Enter" })
      )
    })
    await waitFor(() =>
      expect(
        editor()
          .getEditorState()
          .read(() => $convertToMarkdownString(MARKDOWN_TRANSFORMERS))
      ).toContain('<block type="acceptance-criteria">')
    )
  })
})
