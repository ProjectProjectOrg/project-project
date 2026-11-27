import { buttonClassName } from "@pp/ui/button"
import type { KeyLabels } from "@pp/ui/kbd"
import { HoverDelegate } from "@pp/ui/tooltip"
import { useRef } from "react"

const KEY_LABELS: KeyLabels = {
  ctrl: "Ctrl",
  meta: "Win",
  alt: "Alt",
  shift: "Shift",
  enter: "Enter",
  escape: "Esc",
  backspace: "Backspace",
  delete: "Delete",
  tab: "Tab",
  space: "Space"
}

const ROWS = [
  { id: "ATL-21", status: "Todo", title: "Fix login" },
  { id: "ATL-22", status: "In progress", title: "Empty states" },
  { id: "ATL-23", status: "Done", title: "Export to CSV" }
] as const

const cardBody = (trigger: HTMLElement) => ({
  content: (
    <div className="text-caption">
      {ROWS.find((row) => row.id === trigger.dataset.row)?.title}
    </div>
  ),
  openOnClick: true
})

export default function Delegated() {
  const list = useRef<HTMLUListElement>(null)
  return (
    <>
      <HoverDelegate
        root={list}
        side="bottom"
        keyLabels={KEY_LABELS}
        card={cardBody}
      />
      <ul ref={list} className="flex flex-col gap-1 pb-16">
        {ROWS.map((row) => (
          <li key={row.id} className="flex items-center gap-2 text-body">
            <button
              type="button"
              aria-label={`Status: ${row.status}`}
              data-tooltip={row.status}
              data-tooltip-keys="S"
              className={buttonClassName({
                variant: "ghost",
                tone: "strong",
                size: "compact"
              })}
            >
              {row.status}
            </button>
            <button
              type="button"
              data-hover-card=""
              data-row={row.id}
              aria-haspopup="dialog"
              className="text-muted-foreground"
            >
              {row.id}
            </button>
          </li>
        ))}
      </ul>
    </>
  )
}
