import { CircleCheck, CircleDashed, CircleDot } from "@pp/ui/icons"
import {
  SelectionBar,
  SelectionBarField,
  SelectionBarStack,
  type SelectionBarResult
} from "@pp/ui/selection-bar"
import { SelectionBarPickMenu } from "@pp/ui/selection-bar-menu"
import { useState } from "react"

const STATUSES = [
  {
    value: "todo",
    textValue: "Todo",
    icon: CircleDashed,
    className: "text-muted-foreground"
  },
  {
    value: "progress",
    textValue: "In progress",
    icon: CircleDot,
    className: "text-sky-600"
  },
  {
    value: "done",
    textValue: "Done",
    icon: CircleCheck,
    className: "text-emerald-600"
  }
] as const

type Value = (typeof STATUSES)[number]["value"]

// After a change, the result takes the bar's place: first "Updating…"
// while the request is out, then what came of it. Pick a status and apply
// it: the first try fails ("Couldn't update 2 tickets", with Retry and
// Cancel), a retry lands ("Updated 3 tickets", with Undo). Cancel or Undo
// swaps the selection back in.
export default function Failed() {
  const [status, setStatus] = useState<Value>("todo")
  const [result, setResult] = useState<SelectionBarResult | undefined>()
  const back = () => setResult(undefined)
  const landed = (before: Value) =>
    setResult({
      tone: "success",
      message: "Updated 3 tickets",
      actions: [
        {
          label: "Undo",
          onClick: () => {
            setStatus(before)
            back()
          }
        }
      ]
    })
  const pending = (then: () => void) => {
    setResult({ tone: "pending", message: "Updating 3 tickets…", actions: [] })
    window.setTimeout(then, 700)
  }
  const apply = (next: Value) =>
    pending(() =>
      setResult({
        tone: "error",
        message: "Couldn't update 2 tickets",
        actions: [
          {
            label: "Retry",
            onClick: () =>
              pending(() => {
                const before = status
                setStatus(next)
                landed(before)
              })
          },
          { label: "Cancel", onClick: back }
        ]
      })
    )
  const meta = STATUSES.find((each) => each.value === status) ?? STATUSES[0]
  return (
    <div className="flex min-h-40 w-full flex-col justify-end rounded-xl bg-page p-2">
      <SelectionBar
        label="Actions for 3 selected tickets"
        count="3 selected"
        clearLabel="Clear selection"
        onClear={back}
        result={result}
      >
        <SelectionBarPickMenu
          total={3}
          applyLabel="Apply to 3 tickets"
          options={STATUSES.map((each) => ({
            value: each.value,
            textValue: each.textValue,
            count: each.value === status ? 3 : 0,
            icon: <each.icon className={each.className} />
          }))}
          onApply={apply}
          trigger={
            <SelectionBarField
              name="Status"
              icon={
                <SelectionBarStack>
                  <meta.icon key={meta.value} className={meta.className} />
                </SelectionBarStack>
              }
              value={meta.textValue}
            />
          }
        />
      </SelectionBar>
    </div>
  )
}
