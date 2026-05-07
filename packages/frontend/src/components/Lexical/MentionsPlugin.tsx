import { useCallback, useEffect, useMemo, useState, type JSX } from "react"
import { createPortal } from "react-dom"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import {
  LexicalTypeaheadMenuPlugin,
  MenuOption
} from "@lexical/react/LexicalTypeaheadMenuPlugin"
import { TextNode, $getSelection, $isRangeSelection } from "lexical"
import { Effect } from "effect"
import { AppLayer } from "@/runtime"
import {
  type MentionCandidate,
  type MentionProvider,
  mentionProviders,
  providerForTrigger
} from "@/mentions/registry"
import { useMentionScope } from "@/mentions/scope"
import { $createMentionNode } from "./MentionNode"

class MentionMenuOption extends MenuOption {
  constructor(
    public readonly provider: MentionProvider,
    public readonly candidate: MentionCandidate
  ) {
    super(`${provider.type}:${candidate.id}`)
  }
}

const TRIGGERS = mentionProviders.map((p) => p.trigger).join("")

export function MentionsPlugin(): JSX.Element | null {
  const [editor] = useLexicalComposerContext()
  const scope = useMentionScope()
  const [queryString, setQueryString] = useState<string | null>(null)
  const [activeProvider, setActiveProvider] = useState<MentionProvider | null>(
    null
  )
  const [results, setResults] = useState<ReadonlyArray<MentionCandidate>>([])

  const checkForTriggerMatch = useCallback((text: string) => {
    for (let i = text.length - 1; i >= 0; i--) {
      const ch = text[i]
      if (TRIGGERS.includes(ch)) {
        const prev = i === 0 ? " " : text[i - 1]
        if (/\s/.test(prev)) {
          const provider = providerForTrigger(ch)
          if (!provider) return null
          const matchString = text.slice(i + 1)
          if (/\s/.test(matchString)) return null
          setActiveProvider(provider)
          return {
            leadOffset: i,
            matchingString: matchString,
            replaceableString: text.slice(i)
          }
        }
      }
    }
    return null
  }, [])

  useEffect(() => {
    if (!activeProvider || queryString === null) {
      setResults([])
      return
    }
    let cancelled = false
    Effect.runPromise(
      (
        activeProvider.search(queryString, scope ?? {}) as Effect.Effect<
          ReadonlyArray<MentionCandidate>,
          unknown,
          never
        >
      ).pipe(Effect.provide(AppLayer))
    ).then(
      (r) => {
        if (!cancelled) setResults(r.slice(0, 8))
      },
      () => {
        if (!cancelled) setResults([])
      }
    )
    return () => {
      cancelled = true
    }
  }, [activeProvider, queryString, scope])

  const options = useMemo(
    () =>
      activeProvider
        ? results.map((c) => new MentionMenuOption(activeProvider, c))
        : [],
    [activeProvider, results]
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
        node.select()
        closeMenu()
      })
    },
    [editor]
  )

  return (
    <LexicalTypeaheadMenuPlugin<MentionMenuOption>
      onQueryChange={setQueryString}
      onSelectOption={onSelectOption}
      triggerFn={checkForTriggerMatch}
      options={options}
      menuRenderFn={(anchorRef, { selectedIndex, selectOptionAndCleanUp }) => {
        if (!anchorRef.current || options.length === 0) return null
        return createPortal(
          <div className="bg-popover text-popover-foreground border-border z-50 mt-1 min-w-48 overflow-hidden rounded-md border shadow-md">
            {options.map((opt, i) => (
              <button
                key={opt.key}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault()
                  selectOptionAndCleanUp(opt)
                }}
                className={`hover:bg-accent block w-full px-3 py-1.5 text-left text-sm transition-colors ${
                  i === selectedIndex ? "bg-accent" : ""
                }`}
              >
                {opt.provider.renderRow(opt.candidate)}
              </button>
            ))}
          </div>,
          anchorRef.current
        )
      }}
    />
  )
}
