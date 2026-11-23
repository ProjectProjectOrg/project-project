import { Button } from "@pp/ui/button"
import { Guide } from "@pp/ui/guide"
import { Filter, LayoutGrid, Plus } from "@pp/ui/icons"
import { useRef, useState } from "react"

import { LABELS } from "./parts/labels"

// A series of three. Next and Back move the spotlight, and the card glides
// with it (the tooltip host draws it, like a hover card); Skip ends it on
// any step, and the last step's button says Done.
export default function Steps() {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState(0)
  const parts = useRef<HTMLDivElement>(null)
  const part = (name: string) => () =>
    parts.current?.querySelector(`[data-guide="${name}"]`)
  return (
    <div className="flex w-full flex-col items-center gap-6 rounded-xl surface-page p-6">
      <Button
        size="sm"
        variant="primary"
        onClick={() => {
          setStep(0)
          setOpen(true)
        }}
      >
        Start the guide
      </Button>
      <div
        ref={parts}
        className="flex w-full max-w-md items-center justify-between rounded-[16px] surface-card p-1.5 shadow-(--tooltip-edge)"
      >
        <Button data-guide="new" size="sm" variant="ghost" leadingIcon={Plus}>
          New ticket
        </Button>
        <Button
          data-guide="filter"
          size="sm"
          variant="ghost"
          leadingIcon={Filter}
        >
          Filter
        </Button>
        <Button
          data-guide="board"
          size="sm"
          variant="ghost"
          leadingIcon={LayoutGrid}
        >
          Board
        </Button>
      </div>
      <Guide
        open={open}
        step={step}
        onStepChange={setStep}
        onClose={() => setOpen(false)}
        steps={[
          {
            target: part("new"),
            title: "Add a ticket",
            body: "Type a title and press Enter; it lands at the top of the backlog."
          },
          {
            target: part("filter"),
            title: "Narrow the list",
            body: "Filter by status, assignee or label. Press F to open it from anywhere."
          },
          {
            target: part("board"),
            title: "Switch to the board",
            body: "The same tickets as columns by status. Press V to switch back."
          }
        ]}
        labels={{ ...LABELS, done: "Done" }}
      />
    </div>
  )
}
