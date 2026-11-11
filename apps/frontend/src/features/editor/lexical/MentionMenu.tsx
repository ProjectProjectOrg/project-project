import { MenuOption } from "@lexical/react/LexicalTypeaheadMenuPlugin"
import { useLayoutEffect, useRef } from "react"

import { MenuHighlight } from "@/components/ui/menu-highlight"
import { MenuNote } from "@/components/ui/menu-note"
import {
  menuItemClass,
  menuLabelClass,
  menuPopupClass,
  menuSeparatorClass
} from "@/components/ui/menu-styles"
import { ScrollArea } from "@/components/ui/scroll-area"
import type {
  MentionCandidate,
  MentionProvider
} from "@/features/editor/mentions/registry"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

const MENTION_LISTBOX_ID = "typeahead-menu"

export class MentionMenuOption extends MenuOption {
  constructor(
    public readonly provider: MentionProvider,
    public readonly candidate: MentionCandidate
  ) {
    super(`${provider.type}:${candidate.id}`)
  }
}

export type MenuNoteContent = Readonly<{
  text: string
  tone: "muted" | "error"
}>

export type MenuGroup = Readonly<{
  provider: MentionProvider
  candidates: ReadonlyArray<MentionCandidate>
  note: MenuNoteContent | null
}>

const keyWidth = (ids: ReadonlyArray<string>) =>
  `${Math.max(0, ...ids.map((id) => id.length))}ch`

function useStableHighlight(
  options: ReadonlyArray<MentionMenuOption>,
  selectedIndex: number | null,
  onHighlight: (index: number) => void
) {
  const keys = options.map((option) => option.key).join("\n")
  const last = useRef<{ keys: string; key: string | null } | null>(null)
  useLayoutEffect(() => {
    const previous = last.current
    if (previous !== null && previous.keys !== keys && previous.key !== null) {
      const moved = options.findIndex((option) => option.key === previous.key)
      if (moved >= 0 && moved !== selectedIndex) {
        last.current = { keys, key: previous.key }
        onHighlight(moved)
        return
      }
    }
    last.current = {
      keys,
      key: selectedIndex === null ? null : (options[selectedIndex]?.key ?? null)
    }
  }, [keys, options, selectedIndex, onHighlight])
}

export function MentionMenu({
  groups,
  options,
  selectedIndex,
  onHighlight,
  onSelect
}: Readonly<{
  groups: ReadonlyArray<MenuGroup>
  options: ReadonlyArray<MentionMenuOption>
  selectedIndex: number | null
  onHighlight: (index: number) => void
  onSelect: (option: MentionMenuOption) => void
}>) {
  useStableHighlight(options, selectedIndex, onHighlight)
  const indexed = options.map((option, index) => ({ option, index }))
  return (
    <div
      id={MENTION_LISTBOX_ID}
      role="listbox"
      aria-label={m.tickets_mention_list_label()}
      data-open=""
      className={cn(menuPopupClass, "mt-1 w-80 overflow-hidden p-0")}
    >
      <ScrollArea viewportClassName="max-h-96 [&>div[style]]:!block [&>div[style]]:!min-w-0">
        <div className="relative p-1">
          <MenuHighlight />
          {groups.map(({ provider, candidates, note }, groupIndex) => (
            <div
              key={provider.type}
              role="group"
              aria-label={provider.heading()}
              style={{
                "--row-key-width": keyWidth(
                  candidates.map((candidate) => candidate.id)
                )
              }}
            >
              {groupIndex > 0 && (
                <div aria-hidden className={menuSeparatorClass} />
              )}
              <div aria-hidden className={menuLabelClass}>
                {provider.heading()}
              </div>
              {note !== null && (
                <MenuNote tone={note.tone}>{note.text}</MenuNote>
              )}
              {indexed
                .filter(({ option }) => option.provider === provider)
                .map(({ option, index }, rowIndex) => (
                  <div
                    key={option.key}
                    id={`typeahead-item-${index}`}
                    ref={(element) => option.setRefElement(element)}
                    role="option"
                    tabIndex={-1}
                    aria-selected={index === selectedIndex}
                    data-highlighted={index === selectedIndex ? "" : undefined}
                    onMouseMove={() => {
                      if (index !== selectedIndex) onHighlight(index)
                    }}
                    onMouseDown={(event) => {
                      event.preventDefault()
                      onSelect(option)
                    }}
                    className={cn(
                      menuItemClass,
                      "scroll-my-1",
                      rowIndex === 0 && "scroll-mt-11"
                    )}
                  >
                    {provider.renderRow(option.candidate)}
                  </div>
                ))}
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  )
}
