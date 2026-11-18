import { CircleCheck, CircleDot } from "@pp/ui/icons"
import { KbdShortcut, type KeyLabels } from "@pp/ui/kbd"
import {
  SelectionBar,
  SelectionBarField,
  SelectionBarSeparator,
  type SelectionBarResult
} from "@pp/ui/selection-bar"
import { useState } from "react"

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

// The app's bar: every selected ticket is In progress, so it suggests the
// next status; Actions opens ⌘K with the selection for everything else.
// Take the suggestion to see the result with Undo; once they're Done there
// is no next status, so only Actions is left.
export default function InTheApp() {
  const [done, setDone] = useState(false)
  const [result, setResult] = useState<SelectionBarResult | undefined>()
  const move = () => {
    setDone(true)
    setResult({
      tone: "success",
      message: "Updated 3 tickets",
      actions: [
        {
          label: "Undo",
          onClick: () => {
            setDone(false)
            setResult(undefined)
          }
        }
      ]
    })
  }
  return (
    <div className="flex min-h-40 w-full flex-col justify-end rounded-xl bg-page p-2">
      <SelectionBar
        label="Actions for 3 selected tickets"
        count="3 selected"
        clearLabel="Clear selection"
        onClear={() => setResult(undefined)}
        selectAll={{ label: "Select all 12", onSelect: () => {} }}
        result={result}
      >
        {!done && (
          <>
            <SelectionBarField
              name="Suggested"
              icon={<CircleCheck className="text-state-success" />}
              value="Move to Done"
              onClick={move}
            />
            <SelectionBarSeparator />
          </>
        )}
        <SelectionBarField
          name="Actions"
          value="Actions"
          aria-label="Actions"
          shortcut={
            <KbdShortcut size="sm" keys="Mod+K" keyLabels={KEY_LABELS} />
          }
        />
      </SelectionBar>
      <p className="mt-2 flex items-center gap-1.5 text-caption text-muted-foreground">
        {done ? (
          <CircleCheck className="size-3.5 text-state-success" />
        ) : (
          <CircleDot className="size-3.5 text-state-info" />
        )}
        {done ? "3 tickets Done" : "3 tickets In progress"}
      </p>
    </div>
  )
}
