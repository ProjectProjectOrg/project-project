import { KbdShortcut } from "@pp/ui/kbd"
import {
  SelectionBar,
  SelectionBarField,
  SelectionBarSeparator,
  type SelectionBarResult
} from "@pp/ui/selection-bar"
import { useState } from "react"

import { STATUS } from "../../list-row/demos/parts/tickets"
import { KEY_LABELS, SUGGESTION_KEYS } from "./parts/keys"

// The app's bar on its own: how many, the suggested next step (every
// selected ticket is In progress, so: Move to In review, or N), and Actions,
// which opens ⌘K with the selection. Everything else is a selected row's own
// chips. Take the suggestion to see the result and Undo.
export default function InTheApp() {
  const [status, setStatus] = useState<"progress" | "review">("progress")
  const [result, setResult] = useState<SelectionBarResult | undefined>()
  const next = status === "progress" ? STATUS.review : undefined
  return (
    <div className="flex min-h-40 w-full flex-col justify-end rounded-xl bg-page p-2">
      <SelectionBar
        label="Actions for 4 selected tickets"
        count="4 selected"
        clearLabel="Clear selection"
        onClear={() => setResult(undefined)}
        selectAll={{ label: "Select all 12", onSelect: () => {} }}
        result={result}
      >
        {next !== undefined && (
          <>
            <SelectionBarField
              name="Suggested"
              icon={<next.icon className={next.className} />}
              value={`Move to ${next.label}`}
              aria-keyshortcuts={SUGGESTION_KEYS}
              shortcut={
                <KbdShortcut
                  size="sm"
                  keys={SUGGESTION_KEYS}
                  keyLabels={KEY_LABELS}
                />
              }
              onClick={() => {
                setStatus("review")
                setResult({
                  tone: "success",
                  message: "Updated 4 tickets",
                  actions: [
                    {
                      label: "Undo",
                      onClick: () => {
                        setStatus("progress")
                        setResult(undefined)
                      }
                    }
                  ]
                })
              }}
            />
            <SelectionBarSeparator />
          </>
        )}
        <SelectionBarField
          name="Actions"
          value="Actions"
          aria-keyshortcuts="Meta+K"
          shortcut={
            <KbdShortcut size="sm" keys="Mod+K" keyLabels={KEY_LABELS} />
          }
        />
      </SelectionBar>
    </div>
  )
}
