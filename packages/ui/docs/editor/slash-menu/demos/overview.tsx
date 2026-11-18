import { lookupFor } from "@pp/ui/editor/blocks/block-chrome"
import {
  SlashMenu,
  SlashMenuInputKeys
} from "@pp/ui/editor/slash-menu/slash-menu"
import { basicLabel } from "@pp/ui/editor/slash-menu/slash-menu-item"
import type { SlashTab } from "@pp/ui/editor/slash-menu/slash-menu-items"
import { slashMenuView } from "@pp/ui/editor/slash-menu/slash-menu-items"
import { Input } from "@pp/ui/input"
import { useRef, useState } from "react"

import { EditorKit, SAMPLE_BLOCKS } from "../../kit"

const library = SAMPLE_BLOCKS.library
const lookup = lookupFor(library)

// The menu on its own, driven from an input: type to filter, arrows to
// move, Enter to pick, Tab between tabs. At full width it shows the
// highlighted item's preview.
export default function SlashMenuOverview() {
  const [query, setQuery] = useState("")
  const [tab, setTab] = useState<SlashTab>("all")
  const [input, setInput] = useState<HTMLInputElement | null>(null)
  const [picked, setPicked] = useState<string | null>(null)
  const detachRef = useRef(false)
  const menu = slashMenuView(
    { library, lookup, ticketType: null, body: "", query, basicLabel },
    tab
  )
  return (
    <EditorKit>
      <div className="@container flex w-full flex-col items-center gap-3">
        <div className="flex w-full max-w-[44rem] items-center gap-3">
          <Input
            ref={setInput}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Tab" || menu.tabs.length < 2) return
              event.preventDefault()
              const at = menu.tabs.findIndex((entry) => entry.tab === tab)
              const step = event.shiftKey ? -1 : 1
              const next = menu.tabs.at((at + step) % menu.tabs.length)
              if (next !== undefined) setTab(next.tab)
            }}
            role="combobox"
            aria-expanded
            aria-label="Filter sections"
            placeholder="Type to filter: “che”, “quote”, “criteria”…"
            className="flex-1"
          />
          <span className="shrink-0 text-caption text-muted-foreground tabular-nums">
            {picked === null ? "Nothing picked" : `Picked ${picked}`}
          </span>
        </div>
        <SlashMenu
          menu={menu}
          query={query}
          library={library}
          preview
          detachRef={detachRef}
          onPick={setPicked}
          onTab={setTab}
          keys={<SlashMenuInputKeys input={input} detachRef={detachRef} />}
          className="w-full max-w-[44rem]"
        />
      </div>
    </EditorKit>
  )
}
