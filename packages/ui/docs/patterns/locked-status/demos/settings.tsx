import { Ban, Lock } from "@pp/ui/icons"
import { StatusGlyph } from "@pp/ui/status-glyph"
import { Switch } from "@pp/ui/switch"
import { useState, type ReactNode } from "react"

import {
  StatusIcon,
  type Status
} from "../../../components/list-row/demos/parts/tickets"

type Row = Readonly<{
  key: string
  label: string
  icon: ReactNode
  route: string | null
}>

const ROWS: ReadonlyArray<Row> = [
  { key: "todo", label: "Todo", icon: icon("todo"), route: null },
  {
    key: "progress",
    label: "In progress",
    icon: icon("progress"),
    route: "a branch is linked"
  },
  {
    key: "review",
    label: "In review",
    icon: icon("review"),
    route: "a pull request opens"
  },
  {
    key: "blocked",
    label: "Blocked",
    icon: <StatusGlyph icon={Ban} className="text-state-danger" />,
    route: null
  },
  {
    key: "done",
    label: "Done",
    icon: icon("done"),
    route: "a pull request merges"
  }
]

function icon(status: Status) {
  return <StatusIcon status={status} />
}

const describe = (row: Row, locked: boolean) => {
  if (row.route !== null)
    return `Git automation moves tickets here when ${row.route}.`
  return locked
    ? "No git automation moves tickets here, so only PMs can."
    : "No git automation moves tickets here."
}

export default function Settings() {
  const [locked, setLocked] = useState<ReadonlySet<string>>(
    new Set(["review", "blocked", "done"])
  )
  return (
    <section className="flex w-full max-w-2xl flex-col gap-2">
      <header className="px-0.5">
        <h2 className="text-body font-semibold">Locked statuses</h2>
        <p className="mt-0.5 text-caption text-pretty text-muted-foreground">
          Lock a status so tickets only reach it the way your team agreed,
          and the status means the same thing for every ticket in it. Git
          automation and PMs can still move tickets in. Everyone else sees
          it as locked, and can't drag, pick or create a ticket there. Moving
          a ticket out of a locked status works as usual.
        </p>
      </header>
      <div className="tertiary-tiles divide-y divide-border overflow-hidden rounded-lg border border-border surface-card">
        {ROWS.map((row) => {
          const on = locked.has(row.key)
          return (
            <div
              key={row.key}
              className="flex min-h-14 items-center gap-x-4 px-4 py-3"
            >
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <span className="grid size-6 shrink-0 place-items-center">
                  {row.icon}
                </span>
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 text-body leading-tight font-semibold">
                    {row.label}
                    {on ? (
                      <Lock
                        className="size-3.5 text-muted-foreground"
                        strokeWidth={1.75}
                      />
                    ) : null}
                  </p>
                  <p className="mt-0.5 text-caption text-muted-foreground">
                    {describe(row, on)}
                  </p>
                </div>
              </div>
              <Switch
                aria-label={`Lock ${row.label}`}
                checked={on}
                onCheckedChange={(next) =>
                  setLocked((current) => {
                    const copy = new Set(current)
                    if (next) copy.add(row.key)
                    else copy.delete(row.key)
                    return copy
                  })
                }
              />
            </div>
          )
        })}
      </div>
    </section>
  )
}
