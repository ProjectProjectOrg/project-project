import { RegistryContext, useAtomValue } from "@effect/atom-react"
import { KbdShortcut } from "@pp/ui/kbd"
import {
  SelectionBar as Bar,
  SelectionBarField,
  SelectionBarSeparator
} from "@pp/ui/selection-bar"
import { useHotkey } from "@tanstack/react-hotkeys"
import { useParams } from "@tanstack/react-router"
import * as Result from "effect/reactivity/AsyncResult"
import { use, useEffect } from "react"

import { commandMenuState } from "@/features/command-menu/atoms/commandMenu"
import {
  openCommandMenu,
  type SelectedTicket
} from "@/features/command-menu/lib/commandMenu"
import {
  statusesFor,
  statusesRequest
} from "@/features/projects/atoms/projectStatuses"
import { boardStatusesFor } from "@/features/sprints/lib/boardUtils"
import { sharedTicketFields } from "@/features/tickets/lib/sharedTicketFields"
import { statusMetaFor } from "@/features/tickets/lib/ticketMeta"
import {
  toBulkPatch,
  type TicketEdit
} from "@/features/tickets/lib/ticketPatch"
import { projectOfKey, selectAll } from "@/features/tickets/lib/ticketSelection"
import { appHotkeys } from "@/lib/appHotkeys"
import { keyLabels } from "@/lib/keyLabels"
import { m } from "@/paraglide/messages"

import { applySelected, type SelectionStore } from "./selectionStore"

/*
 * The bar that rises while tickets are selected (@pp/ui/selection-bar): a
 * suggested next step when there is an obvious one (every ticket in the
 * same status: move them to the next; N takes it), and Actions, which opens
 * ⌘K with the selection. Everything else is a selected row's own fields,
 * which change every selected ticket (Row).
 */

export function SelectionBar({
  store,
  onClear
}: Readonly<{ store: SelectionStore; onClear: () => void }>) {
  const registry = use(RegistryContext)
  const count = useAtomValue(store.count)
  const failure = useAtomValue(store.failure)
  const selection = useAtomValue(store.selection)
  // What the last change (from here or ⌘K) did: "Updated 3 tickets ·
  // Undo" for six seconds or until the selection changes ("Updating 3
  // tickets…" only while a retry is out).
  const outcome = useAtomValue(store.outcome)
  const undo = outcome?.selection === selection ? outcome : null
  const remember = (next: Readonly<{ count: number; pending: boolean }>) =>
    registry.set(store.outcome, { ...next, selection })
  useEffect(() => {
    if (undo === null || undo.pending) return undefined
    const timer = window.setTimeout(
      () => registry.set(store.outcome, null),
      UNDO_FOR_MS
    )
    return () => window.clearTimeout(timer)
  }, [undo, registry, store])
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
                      landed === false
                        ? registry.set(store.outcome, null)
                        : remember({ count: failure.count, pending: false })
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
      <SelectionFields store={store} />
    </Bar>
  )
}

function SelectionFields({ store }: Readonly<{ store: SelectionStore }>) {
  const { orgSlug } = useParams({ strict: false })
  const keys = [...useAtomValue(store.selection).keys]
  const known = useAtomValue(store.known)
  const [first] = keys
  if (orgSlug === undefined || first === undefined) return null
  const slug = projectOfKey(first)
  return (
    <Fields
      store={store}
      orgSlug={orgSlug}
      slug={slug}
      tickets={keys.flatMap((key) => known.get(key) ?? [])}
    />
  )
}

function Fields({
  store,
  orgSlug,
  slug,
  tickets
}: Readonly<{
  store: SelectionStore
  orgSlug: string
  slug: string
  tickets: ReadonlyArray<SelectedTicket>
}>) {
  const registry = use(RegistryContext)
  const edit = (change: TicketEdit) =>
    void applySelected(
      registry,
      store,
      slug,
      tickets.map((ticket) => ticket.id),
      toBulkPatch(change)
    )
  const statuses = useAtomValue(statusesFor(statusesRequest(orgSlug, slug)))
  const order = Result.isSuccess(statuses)
    ? boardStatusesFor(statuses.value)
    : []
  const shared = sharedTicketFields(tickets).status
  const at = shared === undefined ? -1 : order.indexOf(shared)
  const next = at === -1 ? undefined : order[at + 1]
  const meta =
    next === undefined || !Result.isSuccess(statuses)
      ? null
      : statusMetaFor(next, statuses.value)

  // N takes the suggestion, from anywhere in the list.
  useHotkey(
    appHotkeys["tickets.selection-next"],
    (event) => {
      if (event.repeat || next === undefined) return
      edit({ status: next })
    },
    { enabled: next !== undefined }
  )
  return (
    <>
      {next !== undefined && meta !== null && (
        <>
          <SelectionBarField
            name={m.tickets_selection_suggested()}
            icon={
              <meta.icon
                className={meta.className}
                style={meta.color ? { color: meta.color } : undefined}
                strokeWidth={1.75}
              />
            }
            value={m.tickets_selection_move_to({ status: meta.label })}
            aria-keyshortcuts="N"
            shortcut={
              <KbdShortcut size="sm" keys="N" keyLabels={keyLabels()} />
            }
            onClick={() => edit({ status: next })}
          />
          <SelectionBarSeparator />
        </>
      )}
      <SelectionBarField
        name={m.tickets_selection_actions()}
        value={m.tickets_selection_actions()}
        aria-label={m.tickets_selection_actions()}
        shortcut={
          <KbdShortcut size="sm" keys="Mod+K" keyLabels={keyLabels()} />
        }
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
