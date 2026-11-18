import { Flag, MoreHorizontal, Tag, User, Zap } from "@pp/ui/icons"
import { ListHoverScope, listGridClassName } from "@pp/ui/list-row"
import { AvatarStack, MemberAvatar } from "@pp/ui/member-avatar"
import {
  SelectionBar,
  SelectionBarField,
  SelectionBarSeparator,
  SelectionBarStack
} from "@pp/ui/selection-bar"
import {
  SelectionBarPickMenu,
  SelectionBarToggleMenu
} from "@pp/ui/selection-bar-menu"
import { Switch } from "@pp/ui/switch"
import { AnimatePresence } from "motion/react"
import { useEffect, useRef, useState } from "react"

import { Row } from "../../list-row/demos/parts/row"
import {
  PRIORITY,
  STATUS,
  type Status
} from "../../list-row/demos/parts/tickets"
import {
  countOf,
  PEOPLE,
  plural,
  PRIORITIES,
  SPRINTS,
  sprintSummary,
  STATUSES,
  TAGS,
  TICKETS,
  type DemoTicket
} from "./parts/backlog"

type Outcome =
  | Readonly<{
      tone: "success"
      count: number
      before: ReadonlyArray<DemoTicket>
    }>
  | Readonly<{ tone: "error"; count: number; retry: () => void }>
  | Readonly<{ tone: "pending"; count: number }>

// How long the demo's requests take, so the pending state shows.
const LATENCY_MS = 700

// The backlog's rows (the List row page's own), and the bar that rises
// with the selection. Each field opens a menu that says how many of the
// selection have each value; picks are staged until Apply. In a narrow
// window the fields fold to their icons, and wrap when even those don't fit.
// Turn on "Fail requests" to see a change fail, and Retry or Cancel it.
export default function Overview() {
  const [rows, setRows] = useState<ReadonlyArray<DemoTicket>>(TICKETS)
  const [picked, setPicked] = useState<ReadonlySet<string>>(
    () => new Set(TICKETS.slice(1, 4).map((row) => row.id))
  )
  // What the last Apply did: it landed (Undo for six seconds), or, with
  // "Fail requests" on, it failed (Retry, Cancel).
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const [fail, setFail] = useState(false)
  // Read at the moment a request goes out, so a Retry after switching it
  // off goes through.
  const failing = useRef(false)
  useEffect(() => {
    if (outcome?.tone !== "success") return undefined
    const timer = window.setTimeout(() => setOutcome(null), 6000)
    return () => window.clearTimeout(timer)
  }, [outcome])

  const selected = rows.filter((row) => picked.has(row.id))
  const total = selected.length
  // A new selection is a new question: the last result makes way for it.
  const toggle = (id: string) => (on: boolean) => {
    setOutcome(null)
    setPicked((current) => {
      const next = new Set(current)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })
  }
  // The bar says it's working at once; the request answers a moment later.
  const edit = (change: (row: DemoTicket) => DemoTicket) => {
    setOutcome({ tone: "pending", count: total })
    window.setTimeout(() => {
      if (failing.current) {
        setOutcome({
          tone: "error",
          // Some of them went through on a real failure; say how many didn't.
          count: Math.max(1, Math.ceil(total / 2)),
          retry: () => edit(change)
        })
        return
      }
      setOutcome({ tone: "success", count: total, before: rows })
      setRows((current) =>
        current.map((row) => (picked.has(row.id) ? change(row) : row))
      )
    }, LATENCY_MS)
  }
  const applyLabel = `Apply to ${plural(total, "ticket", "tickets")}`

  const statuses = countOf(selected, (row) => row.status)
  const priorities = countOf(selected, (row) => row.priority)
  const assignees = countOf(selected, (row) => row.assignee?.id ?? "none")
  const sprints = countOf(selected, (row) => row.sprint ?? "none")
  const tagCounts = new Map<string, number>()
  for (const tag of selected.flatMap((row) => row.tags ?? []))
    tagCounts.set(tag.name, (tagCounts.get(tag.name) ?? 0) + 1)
  const sharedStatus = STATUSES.find((status) => statuses.get(status) === total)
  const sharedPriority = PRIORITIES.find(
    (priority) => priorities.get(priority) === total
  )
  const people = PEOPLE.filter((person) => assignees.has(person.id))
  const sharedPerson = assignees.size === 1 ? (people[0] ?? null) : undefined
  const named = SPRINTS.filter((sprint) => sprints.has(sprint))
  const heldTags = TAGS.filter((tag) => tagCounts.has(tag.name))
  const sameTags = heldTags.every((tag) => tagCounts.get(tag.name) === total)

  return (
    <div
      className="w-full rounded-xl bg-page p-3"
      style={{ "--ticket-key-width": "6ch" }}
    >
      <div className="mb-3 flex items-center gap-2 px-1 text-caption text-muted-foreground">
        <Switch
          aria-label="Fail requests"
          checked={fail}
          onCheckedChange={(next) => {
            failing.current = next
            setFail(next)
          }}
        />
        <span aria-hidden>Fail requests</span>
      </div>
      <ListHoverScope className={listGridClassName}>
        {rows.map((row) => (
          <Row
            key={row.id}
            ticket={row}
            selected={picked.has(row.id)}
            onSelect={toggle(row.id)}
          />
        ))}
      </ListHoverScope>
      <AnimatePresence>
        {total > 0 && (
          <SelectionBar
            label={`Actions for ${total} selected tickets`}
            count={`${total} selected`}
            clearLabel="Clear selection"
            onClear={() => setPicked(new Set())}
            selectAll={
              total < rows.length
                ? {
                    label: `Select all ${rows.length}`,
                    onSelect: () =>
                      setPicked(new Set(rows.map((row) => row.id)))
                  }
                : undefined
            }
            result={
              outcome?.tone === "pending"
                ? {
                    tone: "pending",
                    message: `Updating ${plural(outcome.count, "ticket", "tickets")}…`,
                    actions: []
                  }
                : outcome?.tone === "success"
                  ? {
                      tone: "success",
                      message: `Updated ${plural(outcome.count, "ticket", "tickets")}`,
                      actions: [
                        {
                          label: "Undo",
                          onClick: () => {
                            setRows(outcome.before)
                            setOutcome(null)
                          }
                        }
                      ]
                    }
                  : outcome?.tone === "error"
                    ? {
                        tone: "error",
                        message: `Couldn't update ${plural(outcome.count, "ticket", "tickets")}`,
                        actions: [
                          { label: "Retry", onClick: outcome.retry },
                          { label: "Cancel", onClick: () => setOutcome(null) }
                        ]
                      }
                    : undefined
            }
          >
            <SelectionBarPickMenu
              total={total}
              applyLabel={applyLabel}
              options={STATUSES.map((status) => ({
                value: status,
                textValue: STATUS[status].label,
                count: statuses.get(status) ?? 0,
                icon: <StatusIcon status={status} />
              }))}
              onApply={(status) => edit((row) => ({ ...row, status }))}
              trigger={
                <SelectionBarField
                  name="Status"
                  icon={
                    <SelectionBarStack>
                      {STATUSES.filter((status) => statuses.has(status)).map(
                        (status) => {
                          const meta = STATUS[status]
                          return (
                            <meta.icon
                              key={status}
                              className={meta.className}
                            />
                          )
                        }
                      )}
                    </SelectionBarStack>
                  }
                  value={
                    sharedStatus
                      ? STATUS[sharedStatus].label
                      : plural(statuses.size, "status", "statuses")
                  }
                  mixed={sharedStatus === undefined}
                />
              }
            />
            <SelectionBarPickMenu
              total={total}
              applyLabel={applyLabel}
              options={[
                ...PEOPLE.map((person) => ({
                  value: person.id,
                  textValue: person.name,
                  count: assignees.get(person.id) ?? 0,
                  icon: <MemberAvatar member={person} size={16} />
                })),
                {
                  value: "none",
                  textValue: "Unassigned",
                  count: assignees.get("none") ?? 0,
                  icon: <User />
                }
              ]}
              onApply={(id) =>
                edit((row) => ({
                  ...row,
                  assignee: PEOPLE.find((person) => person.id === id)
                }))
              }
              trigger={
                <SelectionBarField
                  name="Assignee"
                  icon={
                    <SelectionBarStack>
                      {people.length > 0 && (
                        <AvatarStack
                          key="people"
                          subjects={people}
                          size={16}
                          max={3}
                          overlap={4}
                          animated
                          countTooltip={false}
                        />
                      )}
                      {assignees.has("none") && (
                        <User
                          key="nobody"
                          className={
                            people.length > 0
                              ? "text-muted-foreground"
                              : undefined
                          }
                        />
                      )}
                    </SelectionBarStack>
                  }
                  value={
                    sharedPerson === undefined
                      ? plural(assignees.size, "assignee", "assignees")
                      : (sharedPerson?.name ?? "Unassigned")
                  }
                  mixed={sharedPerson === undefined}
                />
              }
            />
            <SelectionBarPickMenu
              total={total}
              applyLabel={applyLabel}
              options={PRIORITIES.map((priority) => {
                const meta = PRIORITY[priority]
                return {
                  value: priority,
                  textValue: meta.label,
                  count: priorities.get(priority) ?? 0,
                  icon: <meta.icon className={meta.className} />
                }
              })}
              onApply={(priority) => edit((row) => ({ ...row, priority }))}
              trigger={
                <SelectionBarField
                  name="Priority"
                  icon={
                    <SelectionBarStack>
                      {PRIORITIES.filter((priority) =>
                        priorities.has(priority)
                      ).map((priority) => {
                        const meta = PRIORITY[priority]
                        return (
                          <meta.icon
                            key={priority}
                            className={meta.className}
                          />
                        )
                      })}
                    </SelectionBarStack>
                  }
                  value={
                    sharedPriority
                      ? PRIORITY[sharedPriority].label
                      : plural(priorities.size, "priority", "priorities")
                  }
                  mixed={sharedPriority === undefined}
                />
              }
            />
            <SelectionBarPickMenu
              total={total}
              applyLabel={applyLabel}
              options={[
                ...SPRINTS.map((sprint) => ({
                  value: sprint,
                  textValue: sprint,
                  count: sprints.get(sprint) ?? 0,
                  icon: <Flag className="text-state-info" />
                })),
                {
                  value: "none",
                  textValue: "No sprint",
                  count: sprints.get("none") ?? 0,
                  icon: <Zap />
                }
              ]}
              onApply={(sprint) =>
                edit(({ sprint: _, ...row }) =>
                  sprint === "none" ? row : { ...row, sprint }
                )
              }
              trigger={
                <SelectionBarField
                  name="Sprint"
                  icon={
                    <SelectionBarStack>
                      {named.length === 1 && sprints.size === 1 ? (
                        <Flag key={named[0]} className="text-state-info" />
                      ) : (
                        <Zap key="sprints" />
                      )}
                    </SelectionBarStack>
                  }
                  value={
                    sprints.has("none") && named.length > 0
                      ? `${sprintSummary(named)}, none`
                      : sprintSummary(named)
                  }
                  mixed={sprints.size > 1}
                />
              }
            />
            <SelectionBarToggleMenu
              total={total}
              applyLabel={applyLabel}
              search={{
                placeholder: "Search labels",
                empty: "No labels match"
              }}
              options={TAGS.map((tag) => ({
                value: tag.name,
                textValue: tag.name,
                count: tagCounts.get(tag.name) ?? 0,
                icon: (
                  <span
                    aria-hidden
                    className="size-2 shrink-0 rounded-full"
                    style={{ backgroundColor: tag.color }}
                  />
                )
              }))}
              onApply={({ add, remove }) =>
                edit((row) => {
                  const kept = (row.tags ?? []).filter(
                    (tag) => !remove.includes(tag.name)
                  )
                  const added = TAGS.filter(
                    (tag) =>
                      add.includes(tag.name) &&
                      !kept.some((each) => each.name === tag.name)
                  )
                  return { ...row, tags: [...kept, ...added] }
                })
              }
              trigger={
                <SelectionBarField
                  name="Labels"
                  icon={
                    <SelectionBarStack>
                      {heldTags.length === 0 ? (
                        <Tag key="none" />
                      ) : (
                        heldTags.map((tag) => (
                          <span
                            key={tag.name}
                            className="size-2 rounded-full"
                            style={{ backgroundColor: tag.color }}
                          />
                        ))
                      )}
                    </SelectionBarStack>
                  }
                  value={
                    heldTags.length === 0
                      ? "No labels"
                      : sameTags
                        ? heldTags.map((tag) => tag.name).join(", ")
                        : plural(heldTags.length, "label", "labels")
                  }
                  mixed={!sameTags}
                />
              }
            />
            <SelectionBarSeparator />
            <SelectionBarField name="More actions" icon={<MoreHorizontal />} />
          </SelectionBar>
        )}
      </AnimatePresence>
    </div>
  )
}

function StatusIcon({ status }: Readonly<{ status: Status }>) {
  const meta = STATUS[status]
  return <meta.icon className={meta.className} />
}
