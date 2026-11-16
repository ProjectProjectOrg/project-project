import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import { LexicalTypeaheadMenuPlugin } from "@lexical/react/LexicalTypeaheadMenuPlugin"
import { mergeRegister } from "@lexical/utils"
import {
  TextNode,
  $getSelection,
  $isRangeSelection,
  $isElementNode,
  BLUR_COMMAND,
  FOCUS_COMMAND,
  KEY_BACKSPACE_COMMAND,
  KEY_DELETE_COMMAND,
  KEY_ENTER_COMMAND,
  KEY_TAB_COMMAND,
  COMMAND_PRIORITY_HIGH,
  COMMAND_PRIORITY_LOW,
  COMMAND_PRIORITY_NORMAL,
  type LexicalEditor,
  type LexicalNode
} from "lexical"
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type JSX
} from "react"

import {
  isProseQuery,
  matchMentionTrigger
} from "@/features/editor/lib/mentionTrigger"
import type {
  MentionCandidate,
  MentionProvider
} from "@/features/editor/mentions/registry"
import { useMentionScope } from "@/features/editor/mentions/scope"
import { ticketProvider } from "@/features/editor/mentions/ticketProvider"
import { userProvider } from "@/features/editor/mentions/userProvider"
import { type PagedSearchResults, usePagedSearch } from "@/hooks/usePagedSearch"
import { m } from "@/paraglide/messages"

import {
  MentionMenu,
  MentionMenuOption,
  type MenuGroup,
  type MenuNoteContent
} from "./MentionMenu"
import { $createMentionNode, $isMentionNode } from "./MentionNode"
import { TypeaheadPortal } from "./TypeaheadPortal"

const MENTION_TRIGGER = "@"
const PEOPLE_LIMIT = 3
const TICKET_LIMIT = 8

const searchSource = (provider: MentionProvider) => ({
  key: provider.type,
  search: provider.search,
  deadEnd: (empty: string, query: string) =>
    isProseQuery(empty) && query.startsWith(empty)
})

const exactItems = (
  results: PagedSearchResults<MentionCandidate>,
  query: string
): ReadonlyArray<MentionCandidate> =>
  results.status === "searching" && isProseQuery(query) ? [] : results.items

const ticketNote = (
  results: PagedSearchResults<MentionCandidate>,
  items: ReadonlyArray<MentionCandidate>
): MenuNoteContent | null => {
  if (items.length > 0) return null
  if (results.status === "failed") {
    return { text: m.tickets_mention_tickets_failed(), tone: "error" }
  }
  if (results.status === "loading" || results.status === "searching") {
    return { text: m.tickets_mention_tickets_loading(), tone: "muted" }
  }
  return { text: m.tickets_mention_tickets_empty(), tone: "muted" }
}

const emptyScope = { orgSlug: "", slug: "" }

export function MentionsPlugin(): JSX.Element | null {
  const [editor] = useLexicalComposerContext()
  const scope = useMentionScope()
  const orgSlug = scope?.orgSlug ?? emptyScope.orgSlug
  const slug = scope?.slug ?? emptyScope.slug
  const members = scope?.members
  const involved = scope?.involved
  const people = useMemo(
    () => userProvider({ orgSlug, slug, members, involved }),
    [orgSlug, slug, members, involved]
  )
  const tickets = useMemo(
    () => ticketProvider({ orgSlug, slug }),
    [orgSlug, slug]
  )
  const [queryString, setQueryString] = useState<string | null>(null)
  const peopleResults = usePagedSearch(
    useMemo(() => searchSource(people), [people]),
    queryString
  )
  const ticketResults = usePagedSearch(
    useMemo(() => searchSource(tickets), [tickets]),
    queryString
  )
  const checkForTriggerMatch = useCallback(
    (text: string) => matchMentionTrigger(text, MENTION_TRIGGER),
    []
  )

  const query = queryString ?? ""
  const hasTickets = slug !== ""

  const groups = useMemo((): ReadonlyArray<MenuGroup> => {
    const ticketItems = exactItems(ticketResults, query)
    const ticketGroup: MenuGroup = {
      provider: tickets,
      candidates: ticketItems.slice(0, TICKET_LIMIT),
      note: ticketNote(ticketResults, ticketItems)
    }
    const peopleGroup: MenuGroup = {
      provider: people,
      candidates: exactItems(peopleResults, query).slice(0, PEOPLE_LIMIT),
      note:
        peopleResults.status === "failed"
          ? { text: people.failed(), tone: "error" }
          : null
    }
    return [
      ...(peopleGroup.candidates.length > 0 || peopleGroup.note !== null
        ? [peopleGroup]
        : []),
      ...(hasTickets ? [ticketGroup] : [])
    ]
  }, [people, peopleResults, tickets, ticketResults, hasTickets, query])

  const options = useMemo(
    () =>
      groups.flatMap(({ provider, candidates }) =>
        candidates.map(
          (candidate) => new MentionMenuOption(provider, candidate)
        )
      ),
    [groups]
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

  useMentionChipDeletion(editor)
  const blurred = useEditorBlurred(editor)
  useHoldKeysWhileSearching(
    editor,
    queryString !== null &&
      (peopleResults.status === "searching" ||
        ticketResults.status === "searching")
  )

  return (
    <LexicalTypeaheadMenuPlugin<MentionMenuOption>
      commandPriority={COMMAND_PRIORITY_NORMAL}
      onQueryChange={setQueryString}
      onClose={() => setQueryString(null)}
      onSelectOption={onSelectOption}
      triggerFn={checkForTriggerMatch}
      options={options}
      menuRenderFn={(
        anchorRef,
        { selectedIndex, selectOptionAndCleanUp, setHighlightedIndex }
      ) => {
        if (!anchorRef.current || groups.length === 0 || blurred) return null
        if (options.length === 0 && isProseQuery(query)) return null
        return (
          <TypeaheadPortal anchor={anchorRef.current}>
            <MentionMenu
              groups={groups}
              options={options}
              selectedIndex={selectedIndex}
              onHighlight={setHighlightedIndex}
              onSelect={selectOptionAndCleanUp}
            />
          </TypeaheadPortal>
        )
      }}
    />
  )
}

function useMentionChipDeletion(editor: LexicalEditor) {
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
}

function useEditorBlurred(editor: LexicalEditor) {
  const [blurred, setBlurred] = useState(false)
  useEffect(
    () =>
      mergeRegister(
        editor.registerCommand(
          BLUR_COMMAND,
          () => {
            setBlurred(true)
            return false
          },
          COMMAND_PRIORITY_LOW
        ),
        editor.registerCommand(
          FOCUS_COMMAND,
          () => {
            setBlurred(false)
            return false
          },
          COMMAND_PRIORITY_LOW
        )
      ),
    [editor]
  )
  return blurred
}

function useHoldKeysWhileSearching(editor: LexicalEditor, searching: boolean) {
  const holding = useRef(false)
  useLayoutEffect(() => {
    holding.current = searching
  }, [searching])
  useEffect(() => {
    const hold = (event: KeyboardEvent | null) => {
      if (!holding.current) return false
      event?.preventDefault()
      return true
    }
    return mergeRegister(
      editor.registerCommand(KEY_ENTER_COMMAND, hold, COMMAND_PRIORITY_HIGH),
      editor.registerCommand(KEY_TAB_COMMAND, hold, COMMAND_PRIORITY_HIGH)
    )
  }, [editor])
}
