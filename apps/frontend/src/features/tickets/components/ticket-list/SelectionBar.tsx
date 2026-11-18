import { RegistryContext, useAtomValue } from "@effect/atom-react"
import type { BulkTicketPatch } from "@pp/shared"
import { MoreHorizontal } from "@pp/ui/icons"
import {
  SelectionBar as Bar,
  SelectionBarField,
  SelectionBarSeparator
} from "@pp/ui/selection-bar"
import { useParams } from "@tanstack/react-router"
import * as Result from "effect/reactivity/AsyncResult"
import { use, useEffect, useState } from "react"

import { commandMenuState } from "@/features/command-menu/atoms/commandMenu"
import {
  openCommandMenu,
  type SelectedTicket
} from "@/features/command-menu/lib/commandMenu"
import { project, projectRequest } from "@/features/projects/atoms/projects"
import { ProjectContext } from "@/features/projects/hooks/useProject"
import { sharedTicketFields } from "@/features/tickets/lib/sharedTicketFields"
import {
  toBulkPatch,
  type TicketEdit
} from "@/features/tickets/lib/ticketPatch"
import { projectOfKey, selectAll } from "@/features/tickets/lib/ticketSelection"
import { m } from "@/paraglide/messages"

import {
  AssigneeField,
  LabelsField,
  PriorityField,
  SprintField,
  StatusField
} from "./SelectionFields"
import { type SelectionStore, updateSelected } from "./selectionStore"
import { groupBy, restoreOf, type Restore } from "./selectionUndo"

/*
 * The bar that rises while tickets are selected (@pp/ui/selection-bar). Each
 * field reads what the selected tickets share, or (muted) how many values
 * they hold, and opens the row's own menu for it; a pick applies to every
 * selected ticket. More actions opens ⌘K with the selection.
 */

export function SelectionBar({
  store,
  onClear
}: Readonly<{ store: SelectionStore; onClear: () => void }>) {
  const registry = use(RegistryContext)
  const count = useAtomValue(store.count)
  const failure = useAtomValue(store.failure)
  const selection = useAtomValue(store.selection)
  // What the last change is doing or did: "Updating 3 tickets…" while it's
  // out, then "Updated 3 tickets · Undo" for six seconds or until the
  // selection changes.
  const [last, setLast] = useState<
    (Undo & Readonly<{ selection: typeof selection }>) | null
  >(null)
  const undo = last?.selection === selection ? last : null
  const remember = (next: Undo | null) =>
    setLast(next && { ...next, selection })
  useEffect(() => {
    if (undo === null || undo.pending) return undefined
    const timer = window.setTimeout(() => setLast(null), UNDO_FOR_MS)
    return () => window.clearTimeout(timer)
  }, [undo])
  // Everything the lists show in this selection's project: what "Select
  // all" would select, so it can say how much.
  const everything = selectAll(
    selection,
    [...store.orders].flatMap((order) => order()),
    null
  ).keys.size
  return (
    <Bar
      label={m.tickets_selection_bar_label({ count })}
      count={m.tickets_selection_count({ count })}
      clearLabel={m.tickets_selection_clear_aria_label()}
      onClear={onClear}
      selectAll={
        everything > count
          ? {
              label: m.tickets_selection_select_all({ count: everything }),
              onSelect: () =>
                registry.set(
                  store.selection,
                  selectAll(
                    registry.get(store.selection),
                    [...store.orders].flatMap((order) => order()),
                    null
                  )
                )
            }
          : undefined
      }
      result={
        failure !== null
          ? {
              tone: "error",
              message: m.tickets_selection_failed({ count: failure.count }),
              actions: [
                {
                  label: m.tickets_selection_retry(),
                  onClick: () => {
                    remember({ count: failure.count, pending: true })
                    void Promise.resolve(failure.retry()).then((landed) =>
                      remember(
                        landed === false
                          ? null
                          : { count: failure.count, pending: false }
                      )
                    )
                  }
                },
                {
                  label: m.tickets_selection_cancel(),
                  onClick: () => registry.set(store.failure, null)
                }
              ]
            }
          : undo?.pending === true
            ? {
                tone: "pending",
                message: m.tickets_selection_updating({ count: undo.count }),
                actions: []
              }
            : undo !== null
              ? {
                  tone: "success",
                  message: m.tickets_selection_updated({ count: undo.count }),
                  actions:
                    undo.run === undefined
                      ? []
                      : [
                          {
                            label: m.tickets_selection_undo(),
                            onClick: undo.run
                          }
                        ]
                }
              : undefined
      }
    >
      <SelectionFields store={store} onApplied={remember} />
    </Bar>
  )
}

function SelectionFields({
  store,
  onApplied
}: Readonly<{
  store: SelectionStore
  onApplied: (undo: Undo | null) => void
}>) {
  const { orgSlug } = useParams({ strict: false })
  const keys = [...useAtomValue(store.selection).keys]
  const known = useAtomValue(store.known)
  const [first] = keys
  if (orgSlug === undefined || first === undefined) return null
  const slug = projectOfKey(first)
  return (
    <ProjectContext value={projectRequest(orgSlug, slug)}>
      <Fields
        store={store}
        onApplied={onApplied}
        orgSlug={orgSlug}
        slug={slug}
        tickets={keys.flatMap((key) => known.get(key) ?? [])}
      />
    </ProjectContext>
  )
}

function Fields({
  store,
  onApplied,
  orgSlug,
  slug,
  tickets
}: Readonly<{
  store: SelectionStore
  onApplied: (undo: Undo | null) => void
  orgSlug: string
  slug: string
  tickets: ReadonlyArray<SelectedTicket>
}>) {
  const registry = use(RegistryContext)
  const ids = tickets.map((ticket) => ticket.id)
  // Applies a change to every selected ticket. The bar says "Updating 3
  // tickets…" at once; the edit itself (shown in the list straight away,
  // then sent) waits for that swap to finish, so the list's re-render
  // doesn't stall it. The answer turns it into "Updated 3 tickets · Undo",
  // or the failure takes its place. Undo puts each ticket's old value back
  // (one update per old value).
  const apply = (patch: BulkTicketPatch, restore: ReadonlyArray<Restore>) => {
    const count = ids.length
    onApplied({ count, pending: true })
    window.setTimeout(() => {
      void updateSelected(registry, store, slug, ids, patch).then((ok) =>
        onApplied(
          ok
            ? {
                count,
                pending: false,
                run: () => {
                  onApplied(null)
                  window.setTimeout(() => {
                    for (const each of restore)
                      void updateSelected(
                        registry,
                        store,
                        slug,
                        each.ids,
                        each.patch
                      )
                  }, SWAP_MS)
                }
              }
            : null
        )
      )
    }, SWAP_MS)
  }
  const edit = (change: TicketEdit) =>
    apply(toBulkPatch(change), restoreOf(tickets, change))
  const shared = sharedTicketFields(tickets)

  const detail = useAtomValue(project(projectRequest(orgSlug, slug)))
  const members = Result.isSuccess(detail) ? detail.value.members : []

  return (
    <>
      <StatusField
        tickets={tickets}
        shared={shared.status ?? null}
        onEdit={edit}
      />
      <AssigneeField
        tickets={tickets}
        common={shared.assignees}
        members={members}
        onEdit={edit}
      />
      <PriorityField
        tickets={tickets}
        shared={shared.priority ?? null}
        onEdit={edit}
      />
      <SprintField
        orgSlug={orgSlug}
        slug={slug}
        tickets={tickets}
        onSprint={(sprint, before) =>
          apply(
            { sprint },
            groupBy(tickets, (ticket) => before.get(ticket.id) ?? null).map(
              ([old, group]) => ({ ids: group, patch: { sprint: old } })
            )
          )
        }
      />
      <LabelsField tickets={tickets} common={shared.tags} onEdit={edit} />
      <SelectionBarSeparator />
      <SelectionBarField
        name={m.tickets_selection_field_more()}
        icon={<MoreHorizontal strokeWidth={1.75} />}
        onClick={() => {
          const [lead] = tickets
          if (lead === undefined) return
          registry.set(
            commandMenuState,
            openCommandMenu(
              { orgSlug, slug, ticketId: lead.id },
              "root",
              tickets
            )
          )
        }}
      />
    </>
  )
}

const UNDO_FOR_MS = 6000

// The last change: on its way (pending), then landed, with its Undo (none
// after a retry, which has no old values to put back).
type Undo = Readonly<{ count: number; pending: boolean; run?: () => void }>

// The bar's swap (transitions.morph): a change waits this long before it
// renders and sends, so the swap plays smoothly first.
const SWAP_MS = 260
