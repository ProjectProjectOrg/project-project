import { $convertToMarkdownString, type Transformer } from "@lexical/markdown"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import {
  LexicalTypeaheadMenuPlugin,
  MenuOption
} from "@lexical/react/LexicalTypeaheadMenuPlugin"
import { mergeRegister } from "@lexical/utils"
import type { Library, TicketType } from "@pp/shared"
import { useRouter } from "@tanstack/react-router"
import {
  COMMAND_PRIORITY_CRITICAL,
  COMMAND_PRIORITY_EDITOR,
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

import { lookupFor } from "@/features/editor/lib/blockChrome"

import type { EditorBlocksMode } from "./editorBlocks"
import { $runSlashItem, $typeSlashTrigger } from "./slashCommands"
import {
  cycleSlashTab,
  slashMenuView,
  slashTriggerMatch,
  type SlashItem,
  type SlashTab
} from "./slashMenuItems"
import { basicLabel, SlashMenuList, type SlashMenuModel } from "./SlashMenuView"

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

type RouteParams = Readonly<{ orgSlug?: string; slug?: string }>

function useOpenGallery() {
  const router: ReturnType<typeof useRouter> | undefined = useRouter({
    warn: false
  })
  return useCallback(
    (entry: "block" | "template") => {
      if (router === undefined) return
      const params: RouteParams = router.state.matches.at(-1)?.params ?? {}
      const search = entry === "block" ? { tab: "blocks" as const } : {}
      if (params.orgSlug === undefined) return
      if (params.slug === undefined)
        void router.navigate({
          to: "/orgs/$orgSlug/settings/templates",
          params: { orgSlug: params.orgSlug },
          search
        })
      else
        void router.navigate({
          to: "/orgs/$orgSlug/projects/$slug/settings/templates",
          params: { orgSlug: params.orgSlug, slug: params.slug },
          search
        })
    },
    [router]
  )
}

export function SlashMenuPlugin({
  library,
  ticketType,
  transformers,
  mode = "ticket"
}: Readonly<{
  library: Library
  ticketType: TicketType | null
  transformers: ReadonlyArray<Transformer>
  mode?: EditorBlocksMode
}>) {
  const [editor] = useLexicalComposerContext()
  const [query, setQuery] = useState<string | null>(null)
  const [body, setBody] = useState("")
  const bodyRef = useRef<string | null>(null)
  const [tab, setTab] = useState<SlashTab>("all")
  const detachRef = useRef(false)
  const openGallery = useOpenGallery()
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
            const tabs = menuRef.current.tabs.map((entry) => entry.tab)
            if (!openRef.current || tabs.length < 2) return false
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
      if (target instanceof Element && target.closest("#typeahead-menu")) return
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
        openGallery(item.entry)
        return
      }
      editor.update(() => {
        nodeToReplace?.remove()
        $runSlashItem(editor, option.item, {
          transformers,
          lookup,
          detach,
          mode
        })
        closeMenu()
      })
    },
    [editor, lookup, mode, openGallery, transformers]
  )

  return (
    <LexicalTypeaheadMenuPlugin<SlashMenuOption>
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
                lookup={lookup}
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
              anchorRef.current
            )
      }
    />
  )
}
