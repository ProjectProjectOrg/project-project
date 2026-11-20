import { Button } from "@pp/ui/button"
import { Checkbox } from "@pp/ui/checkbox"
import { Guide } from "@pp/ui/guide"
import { ItemLink } from "@pp/ui/item-link"
import { KbdShortcut } from "@pp/ui/kbd"
import {
  ListHoverScope,
  ListRow,
  ListRowTitle,
  listGridClassName
} from "@pp/ui/list-row"
import {
  SelectionBar,
  SelectionBarField,
  SelectionBarSeparator
} from "@pp/ui/selection-bar"
import { TicketKey } from "@pp/ui/ticket-key"
import { AnimatePresence } from "motion/react"
import { useRef, useState } from "react"

import { STATUS } from "../../list-row/demos/parts/tickets"
import type { DemoTicket } from "./parts/backlog"
import {
  FIELD_KEYS,
  KEY_LABELS,
  SUGGESTION_KEYS,
  useBarKeys,
  type Field
} from "./parts/keys"
import { useListLab, useRowMenus, type ListLab } from "./parts/row-menus"

type Opened = Readonly<{ row: string; field: Field }> | null

// The rows are the toolbar. With tickets selected (the four In progress
// start selected), a selected row's status, priority, assignee, sprint or
// labels change every selected ticket: chip, then value, right where you'd
// change one. Hovering a property lights it on every selected row, and its
// menu says how many tickets it changes. The keys (S, A, P, ⇧S, T) open the
// menu on the row under the pointer. The bar says how many, suggests the
// next step (N), and opens Actions (⌘K) for the rest. "Show the guide"
// plays the guide that teaches it.
export default function Overview() {
  const lab = useListLab()
  const [opened, setOpened] = useState<Opened>(null)
  const [hovered, setHovered] = useState<string | null>(null)
  const [lit, setLit] = useState<Field | null>(null)
  const [guide, setGuide] = useState(false)
  const list = useRef<HTMLDivElement>(null)
  const count = lab.selected.length
  const shown =
    lit ?? (opened !== null && lab.picked.has(opened.row) ? opened.field : null)
  useBarKeys((keys) => {
    if (count === 0) return false
    if (keys === SUGGESTION_KEYS && lab.nextStatus !== undefined) {
      lab.applyNext()
      return true
    }
    const field = FIELD_KEYS[keys]
    if (field === undefined) return false
    const row =
      hovered !== null && lab.picked.has(hovered)
        ? hovered
        : lab.selected[0]?.id
    if (row === undefined) return false
    setOpened({ row, field })
    return true
  })
  const next = lab.nextStatus
  return (
    <div
      className="w-full rounded-xl bg-page p-3"
      style={{ "--ticket-key-width": "6ch" }}
    >
      <div className="mb-2 flex px-1">
        <Button
          size="sm"
          variant="secondary"
          disabled={count < 2}
          onClick={() => setGuide(true)}
        >
          Show the guide
        </Button>
      </div>
      <div ref={list}>
        <ListHoverScope>
          <div className={listGridClassName}>
            {lab.rows.map((row) => (
              <MenuRow
                key={row.id}
                row={row}
                lab={lab}
                open={opened?.row === row.id ? opened.field : null}
                setOpen={(field) =>
                  setOpened(field === null ? null : { row: row.id, field })
                }
                onHover={() => setHovered(row.id)}
                lit={shown}
                onLight={setLit}
              />
            ))}
          </div>
        </ListHoverScope>
      </div>
      <AnimatePresence>
        {count > 0 && (
          <SelectionBar
            label={`Actions for ${count} selected tickets`}
            count={`${count} selected`}
            clearLabel="Clear selection"
            onClear={lab.clear}
            selectAll={
              count < lab.rows.length
                ? {
                    label: `Select all ${lab.rows.length}`,
                    onSelect: lab.selectAll
                  }
                : undefined
            }
            result={lab.result}
          >
            {next !== undefined && (
              <>
                <SelectionBarField
                  name="Suggested"
                  icon={<StatusIcon status={next} />}
                  value={`Move to ${STATUS[next].label}`}
                  aria-keyshortcuts={SUGGESTION_KEYS}
                  shortcut={
                    <KbdShortcut
                      size="sm"
                      keys={SUGGESTION_KEYS}
                      keyLabels={KEY_LABELS}
                    />
                  }
                  onClick={lab.applyNext}
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
        )}
      </AnimatePresence>
      <Guide
        open={guide && count > 1}
        onClose={() => setGuide(false)}
        steps={[
          {
            target: () => {
              const first = lab.selected[0]
              return first === undefined
                ? null
                : list.current?.querySelector(`[data-row="${first.id}"]`)
            },
            title: `Edit all ${count} tickets at once`,
            body: "Change the status, priority, assignee, sprint or labels on any selected row, and every selected ticket gets the same change. Hover a field first to see which tickets it will change."
          }
        ]}
        labels={{
          done: "Got it",
          next: "Next",
          back: "Back",
          skip: "Skip the guide",
          progress: (step, total) => `${step} of ${total}`
        }}
      />
    </div>
  )
}

function StatusIcon({ status }: Readonly<{ status: DemoTicket["status"] }>) {
  const meta = STATUS[status]
  return <meta.icon className={meta.className} />
}

function MenuRow({
  row,
  lab,
  open,
  setOpen,
  onHover,
  lit,
  onLight
}: Readonly<{
  row: DemoTicket
  lab: ListLab
  open: Field | null
  setOpen: (field: Field | null) => void
  onHover: () => void
  lit: Field | null
  onLight: (field: Field | null) => void
}>) {
  const menus = useRowMenus(lab, row, open, setOpen, lit, onLight)
  const selected = lab.picked.has(row.id)
  return (
    <div onPointerEnter={onHover} className="contents">
      <ListRow
        data-row={row.id}
        selected={selected}
        link={
          <ItemLink
            href={`#${row.id}`}
            aria-label={`${row.id} ${row.title}`}
            onClick={(event) => event.preventDefault()}
          />
        }
        lead={
          <Checkbox
            checked={selected}
            onCheckedChange={(checked) => lab.toggle(row.id, checked)}
            aria-label={`Select ${row.id}`}
            variant="quiet"
            className="opacity-0 group-hover/reveal:opacity-100 data-checked:opacity-100"
          />
        }
        status={menus.status}
        priority={menus.priority}
        ticketKey={
          <TicketKey value={row.id} className="min-w-(--ticket-key-width)" />
        }
        title={<ListRowTitle>{row.title}</ListRowTitle>}
        trailing={
          <>
            {menus.labels}
            {menus.sprint}
          </>
        }
        assignee={menus.assignee}
      />
    </div>
  )
}
