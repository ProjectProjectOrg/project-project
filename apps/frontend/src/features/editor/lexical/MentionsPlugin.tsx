import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import {
  LexicalTypeaheadMenuPlugin,
  MenuOption
} from "@lexical/react/LexicalTypeaheadMenuPlugin"
import {
  TextNode,
  $getSelection,
  $isRangeSelection,
  $isElementNode,
  KEY_BACKSPACE_COMMAND,
  KEY_DELETE_COMMAND,
  COMMAND_PRIORITY_LOW,
  type LexicalNode
} from "lexical"
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type JSX
} from "react"

import { MenuHighlight } from "@/components/ui/menu-highlight"
import { MenuNote } from "@/components/ui/menu-note"
import { menuItemClass, menuPopupClass } from "@/components/ui/menu-styles"
import {
  type MentionResults,
  useMentionResults
} from "@/features/editor/hooks/useMentionResults"
import {
  isProseQuery,
  matchMentionTrigger
} from "@/features/editor/lib/mentionTrigger"
import {
  type MentionCandidate,
  type MentionProvider,
  mentionProviders,
  providerForTrigger,
  providerForType
} from "@/features/editor/mentions/registry"
import { useMentionScope } from "@/features/editor/mentions/scope"
import { isNearScrollEnd } from "@/lib/scroll"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

import { $createMentionNode, $isMentionNode } from "./MentionNode"
import { TypeaheadPortal } from "./TypeaheadPortal"

type MenuNoteContent = Readonly<{ text: string; tone: "muted" | "error" }>

const noteFor = (
  provider: MentionProvider,
  results: MentionResults,
  query: string
): MenuNoteContent | null => {
  if (results.status === "failed") {
    return { text: provider.notes.failed(), tone: "error" }
  }
  if (results.candidates.length > 0) return null
  if (results.status === "loading" || results.status === "searching") {
    return { text: provider.notes.loading(), tone: "muted" }
  }
  if (results.status === "ready" && !isProseQuery(query)) {
    return { text: provider.notes.empty(), tone: "muted" }
  }
  return null
}

class MentionMenuOption extends MenuOption {
  constructor(
    public readonly provider: MentionProvider,
    public readonly candidate: MentionCandidate
  ) {
    super(`${provider.type}:${candidate.id}`)
  }
}

const emptyScope = { orgSlug: "", slug: "" }

export function MentionsPlugin(): JSX.Element | null {
  const [editor] = useLexicalComposerContext()
  const scope = useMentionScope()
  const orgSlug = scope?.orgSlug ?? emptyScope.orgSlug
  const slug = scope?.slug ?? emptyScope.slug
  const members = scope?.members
  const involved = scope?.involved
  const providers = useMemo(
    () => mentionProviders({ orgSlug, slug, members, involved }),
    [orgSlug, slug, members, involved]
  )
  const triggers = useMemo(
    () => providers.map((provider) => provider.trigger).join(""),
    [providers]
  )
  const [queryString, setQueryString] = useState<string | null>(null)
  const [activeType, setActiveType] = useState<MentionProvider["type"] | null>(
    null
  )
  const activeProvider = useMemo(
    () =>
      activeType === null
        ? null
        : (providerForType(providers, activeType) ?? null),
    [activeType, providers]
  )
  const results = useMentionResults(activeProvider, queryString)
  const listRef = useRef<HTMLDivElement>(null)

  const lastQuery = useRef<string | null>(null)

  const onQueryChange = useCallback((next: string | null) => {
    if (lastQuery.current !== next) listRef.current?.scrollTo({ top: 0 })
    lastQuery.current = next
    setQueryString(next)
  }, [])

  const checkForTriggerMatch = useCallback(
    (text: string) => {
      const match = matchMentionTrigger(text, triggers)
      if (match === null) return null
      const provider = providerForTrigger(providers, match.trigger)
      if (!provider) return null
      setActiveType(provider.type)
      return match
    },
    [providers, triggers]
  )

  const options = useMemo(
    () =>
      activeProvider === null
        ? []
        : results.candidates.map(
            (candidate) => new MentionMenuOption(activeProvider, candidate)
          ),
    [activeProvider, results.candidates]
  )

  const onSelectOption = useCallback(
    (
      selectedOption: MentionMenuOption,
      nodeToReplace: TextNode | null,
      closeMenu: () => void
    ) => {
      editor.update(() => {
        const sel = $getSelection()
        if (!$isRangeSelection(sel)) return
        const node = $createMentionNode(
          selectedOption.provider.type,
          selectedOption.candidate.id,
          selectedOption.candidate.label
        )
        if (nodeToReplace) nodeToReplace.replace(node)
        else sel.insertNodes([node])
        node.selectNext()
        closeMenu()
      })
    },
    [editor]
  )

  useEffect(() => {
    const adjacentNode = (
      direction: "previous" | "next"
    ): LexicalNode | null => {
      const sel = $getSelection()
      if (!$isRangeSelection(sel) || !sel.isCollapsed()) return null
      const anchor = sel.anchor
      const node = anchor.getNode()
      if (anchor.type === "text") {
        if (direction === "previous") {
          return anchor.offset === 0 ? node.getPreviousSibling() : null
        }
        return anchor.offset === node.getTextContentSize()
          ? node.getNextSibling()
          : null
      }
      if (!$isElementNode(node)) return null
      const idx = direction === "previous" ? anchor.offset - 1 : anchor.offset
      return node.getChildAtIndex(idx)
    }
    const removeMention = (target: LexicalNode | null) => {
      if (!$isMentionNode(target)) return false
      target.remove()
      return true
    }
    const removeBackspace = editor.registerCommand<KeyboardEvent | null>(
      KEY_BACKSPACE_COMMAND,
      (e) => {
        const removed = removeMention(adjacentNode("previous"))
        if (removed) e?.preventDefault()
        return removed
      },
      COMMAND_PRIORITY_LOW
    )
    const removeDelete = editor.registerCommand<KeyboardEvent | null>(
      KEY_DELETE_COMMAND,
      (e) => {
        const removed = removeMention(adjacentNode("next"))
        if (removed) e?.preventDefault()
        return removed
      },
      COMMAND_PRIORITY_LOW
    )
    return () => {
      removeBackspace()
      removeDelete()
    }
  }, [editor])

  return (
    <LexicalTypeaheadMenuPlugin<MentionMenuOption>
      onQueryChange={onQueryChange}
      onSelectOption={onSelectOption}
      triggerFn={checkForTriggerMatch}
      options={options}
      menuRenderFn={(
        anchorRef,
        { selectedIndex, selectOptionAndCleanUp, setHighlightedIndex }
      ) => {
        if (!anchorRef.current || activeProvider === null) return null
        const note = noteFor(activeProvider, results, queryString ?? "")
        if (options.length === 0 && note === null) return null
        return (
          <TypeaheadPortal anchor={anchorRef.current}>
            <div
              ref={listRef}
              role="listbox"
              data-open=""
              className={cn(menuPopupClass, "mt-1 max-h-64 w-80")}
              onScroll={(event) => {
                if (results.hasMore && isNearScrollEnd(event.currentTarget)) {
                  results.loadMore()
                }
              }}
            >
              <MenuHighlight />
              {note !== null && (
                <MenuNote tone={note.tone}>{note.text}</MenuNote>
              )}
              {options.map((opt, i) => (
                <div
                  key={opt.key}
                  id={`typeahead-item-${i}`}
                  ref={(element) => opt.setRefElement(element)}
                  role="option"
                  tabIndex={-1}
                  aria-selected={i === selectedIndex}
                  data-highlighted={i === selectedIndex ? "" : undefined}
                  onMouseEnter={() => setHighlightedIndex(i)}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    selectOptionAndCleanUp(opt)
                  }}
                  className={menuItemClass}
                >
                  {opt.provider.renderRow(opt.candidate)}
                </div>
              ))}
              {results.loadingMore && (
                <MenuNote>{m.tickets_mention_loading_more()}</MenuNote>
              )}
              {results.loadMoreFailed && (
                <MenuNote tone="error">
                  {m.tickets_mention_load_more_failed()}
                </MenuNote>
              )}
            </div>
          </TypeaheadPortal>
        )
      }}
    />
  )
}
