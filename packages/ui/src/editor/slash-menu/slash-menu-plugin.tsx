import { $convertToMarkdownString, type Transformer } from "@lexical/markdown"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import {
  LexicalTypeaheadMenuPlugin,
  MenuOption
} from "@lexical/react/LexicalTypeaheadMenuPlugin"
import { mergeRegister } from "@lexical/utils"
import type { Library, TypeKey } from "@pp/shared"
import {
  COMMAND_PRIORITY_CRITICAL,
  COMMAND_PRIORITY_EDITOR,
  COMMAND_PRIORITY_NORMAL,
  createCommand,
  $setSelection,
  KEY_TAB_COMMAND,
  type LexicalCommand,
  type TextNode
} from "lexical"
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from "react"
import { createPortal } from "react-dom"

import { lookupFor } from "../blocks/block-chrome"
import { useEditorServices } from "../services"
import { $runSlashItem, $typeSlashTrigger } from "./slash-commands"
import { type SlashMenuModel } from "./slash-menu"
import { basicLabel } from "./slash-menu-item"
import {
  cycleSlashTab,
  slashMenuView,
  slashTriggerMatch,
  type SlashItem,
  type SlashMode,
  type SlashTab
} from "./slash-menu-items"
import { SlashMenuList } from "./slash-menu-view"

export const OPEN_SLASH_MENU_COMMAND: LexicalCommand<SlashTab | null> =
  createCommand("OPEN_SLASH_MENU_COMMAND")

class SlashMenuOption extends MenuOption {
  constructor(public readonly item: SlashItem) {
    super(item.key)
  }
}

type SlashMenuState = SlashMenuModel &
  Readonly<{
    options: Array<SlashMenuOption>
  }>

const EMPTY_MENU: SlashMenuState = {
  tab: "all",
  tabs: [],
  sections: [],
  options: []
}

export function SlashMenuPlugin({
  library,
  ticketType,
  transformers,
  mode = "ticket"
}: Readonly<{
  library: Library
  ticketType: TypeKey | null
  transformers: ReadonlyArray<Transformer>
  mode?: SlashMode
}>) {
  const [editor] = useLexicalComposerContext()
  const [query, setQuery] = useState<string | null>(null)
  const [body, setBody] = useState("")
  const bodyRef = useRef<string | null>(null)
  const [tab, setTab] = useState<SlashTab>("all")
  const detachRef = useRef(false)
  const openGallery = useEditorServices().openBlockGallery
  const lookup = useMemo(() => lookupFor(library), [library])

  const changeQuery = useCallback(
    (next: string | null) => {
      if (next === null) bodyRef.current = null
      else if (bodyRef.current === null) {
        bodyRef.current = editor
          .getEditorState()
          .read(() => $convertToMarkdownString([...transformers]))
        setBody(bodyRef.current)
      }
      setQuery(next)
    },
    [editor, transformers]
  )

  const menu = useMemo((): SlashMenuState => {
    if (query === null) return EMPTY_MENU
    const view = slashMenuView(
      { library, lookup, ticketType, body, query, basicLabel, mode },
      tab
    )
    return {
      tab: view.tab,
      tabs: view.tabs,
      sections: view.sections,
      options: view.sections.flatMap((section) =>
        section.items.map((item) => new SlashMenuOption(item))
      )
    }
  }, [body, library, lookup, mode, tab, query, ticketType])

  const menuRef = useRef(menu)
  const openRef = useRef(false)
  useLayoutEffect(() => {
    menuRef.current = menu
    openRef.current = query !== null
  }, [menu, query])
  const switchTab = useCallback((next: SlashTab) => setTab(next), [])

  useEffect(
    () =>
      mergeRegister(
        editor.registerCommand(
          OPEN_SLASH_MENU_COMMAND,
          (section) => {
            setTab(section ?? "all")
            editor.focus(() => editor.update($typeSlashTrigger))
            return true
          },
          COMMAND_PRIORITY_EDITOR
        ),
        editor.registerCommand(
          KEY_TAB_COMMAND,
          (event) => {
            if (!openRef.current) return false
            const tabs = menuRef.current.tabs.map((entry) => entry.tab)
            if (tabs.length < 2) return false
            event.preventDefault()
            switchTab(
              cycleSlashTab(tabs, menuRef.current.tab, event.shiftKey ? -1 : 1)
            )
            return true
          },
          COMMAND_PRIORITY_CRITICAL
        )
      ),
    [editor, switchTab]
  )

  // Lexical's typeahead ignores outside clicks; clearing the selection closes it.
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (!open) return undefined
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Node)) return
      if (editor.getRootElement()?.contains(target) === true) return
      if (
        target instanceof Element &&
        target.closest("[data-slash-menu-frame]")
      )
        return
      editor.update(() => $setSelection(null))
    }
    document.addEventListener("pointerdown", onPointerDown, true)
    return () =>
      document.removeEventListener("pointerdown", onPointerDown, true)
  }, [editor, open])

  const onSelectOption = useCallback(
    (
      option: SlashMenuOption,
      nodeToReplace: TextNode | null,
      closeMenu: () => void
    ) => {
      const detach = detachRef.current
      detachRef.current = false
      const { item } = option
      if (item.kind === "gallery") {
        editor.update(() => {
          nodeToReplace?.remove()
          closeMenu()
        })
        openGallery()
        return
      }
      editor.update(() => {
        nodeToReplace?.remove()
        $runSlashItem(editor, option.item, {
          transformers,
          lookup,
          detach,
          mode: mode === "basic" ? undefined : mode
        })
        closeMenu()
      })
    },
    [editor, lookup, mode, openGallery, transformers]
  )

  // Lexical's typeahead removes and re-adds its anchor element on every
  // keystroke, which would replay the menu's opening animation and remeasure
  // it each time; the menu places itself from the caret, so it renders into
  // a host of its own that stays put.
  const [host] = useState(() => document.createElement("div"))
  useLayoutEffect(() => {
    document.body.append(host)
    return () => host.remove()
  }, [host])

  return (
    <LexicalTypeaheadMenuPlugin<SlashMenuOption>
      commandPriority={COMMAND_PRIORITY_NORMAL}
      onQueryChange={changeQuery}
      onOpen={() => setOpen(true)}
      onClose={() => {
        setOpen(false)
        setTab("all")
      }}
      onSelectOption={onSelectOption}
      triggerFn={slashTriggerMatch}
      options={menu.options}
      menuRenderFn={(anchorRef, itemProps, matchingString) =>
        anchorRef.current === null
          ? null
          : createPortal(
              <SlashMenuList
                editor={editor}
                menu={menu}
                library={library}
                detachRef={detachRef}
                onTab={switchTab}
                query={matchingString}
                onPick={(key) => {
                  const option = itemProps.options.find(
                    (candidate) => candidate.key === key
                  )
                  if (option !== undefined)
                    itemProps.selectOptionAndCleanUp(option)
                }}
              />,
              host
            )
      }
    />
  )
}
