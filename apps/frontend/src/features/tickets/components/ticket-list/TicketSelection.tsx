import { RegistryContext, useAtomValue } from "@effect/atom-react"
import type { BulkTicketPatch } from "@pp/shared"
import { Guide } from "@pp/ui/guide"
import { useHotkey } from "@tanstack/react-hotkeys"
import * as Atom from "effect/reactivity/Atom"
import type { AtomRegistry } from "effect/reactivity/AtomRegistry"
import * as Schema from "effect/Schema"
import { AnimatePresence } from "motion/react"
import {
  createContext,
  use,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react"

import { pointedTicket } from "@/features/command-menu/atoms/commandMenu"
import { useCommandScope } from "@/features/command-menu/hooks/useCommandScope"
import type { SelectedTicket } from "@/features/command-menu/lib/commandMenu"
import type { CommandScope } from "@/features/command-menu/lib/commandScopes"
import { lightRowFields } from "@/features/tickets/lib/selectionKeys"
import {
  toBulkPatch,
  type TicketEdit
} from "@/features/tickets/lib/ticketPatch"
import {
  emptySelection,
  projectOfKey,
  selectionKey,
  toggleSelection
} from "@/features/tickets/lib/ticketSelection"
import {
  createLocalStorageCodec,
  useLocalStorageState
} from "@/hooks/useLocalStorageState"
import { appHotkeys } from "@/lib/appHotkeys"
import { m } from "@/paraglide/messages"

import { SelectionBar } from "./SelectionBar"
import {
  allInOrder,
  applySelected,
  orderContaining,
  selectFromOrder,
  type SelectionEntry,
  createSelectionStore,
  resetSelection,
  type SelectionStore
} from "./selectionStore"

const SelectionContext = createContext<SelectionStore | null>(null)
const OrderContext = createContext<
  (() => ReadonlyArray<SelectionEntry>) | null
>(null)
const notSelected = Atom.make(false)

export function TicketSelectionProvider({
  resetKey,
  children
}: Readonly<{ resetKey: string; children: ReactNode }>) {
  const [store] = useState(createSelectionStore)
  const registry = use(RegistryContext)
  const shownKey = useRef(resetKey)
  useLayoutEffect(() => {
    if (shownKey.current === resetKey) return
    shownKey.current = resetKey
    resetSelection(registry, store)
  }, [registry, store, resetKey])
  const count = useAtomValue(store.count)
  const selecting = count > 0
  const scope = useMemo(
    () => selectionScope(registry, store),
    [registry, store]
  )
  useCommandScope(scope)
  const root = useRef<HTMLDivElement>(null)
  // Hovering a selected row's field lights it on every selected row.
  useEffect(() => {
    const list = root.current
    return list === null ? undefined : lightRowFields(list)
  }, [])
  // The first time several are selected, a guide says the rows change them
  // all (once per person; this browser remembers it for now).
  const [guideSeen, setGuideSeen] = useLocalStorageState(
    "projectproject:guide:bulk-edit",
    guideSeenCodec,
    false
  )

  const rowKeyFor = (target: EventTarget | null) => {
    const list = root.current
    if (list === null) return null
    if (target instanceof Element && list.contains(target)) {
      const row = target.closest<HTMLElement>("[data-selection-key]")
      if (row !== null) return row.dataset.selectionKey ?? null
    }
    const pointed = registry.get(pointedTicket)
    if (pointed === null) return null
    const key = selectionKey(pointed.slug, pointed.ticketId)
    return list.querySelector(`[data-selection-key="${key}"]`) === null
      ? null
      : key
  }
  useHotkey(appHotkeys["tickets.select-all"], (event) => {
    const key = rowKeyFor(event.target)
    const origin =
      key === null
        ? undefined
        : orderContaining(store, key, registry.get(pointedTicket)?.remove)
    selectFromOrder(
      registry,
      store,
      allInOrder(store, registry.get(store.selection), key),
      origin
    )
  })
  useHotkey(
    appHotkeys["tickets.select"],
    (event) => {
      const key = rowKeyFor(event.target)
      if (key === null) return
      event.preventDefault()
      selectFromOrder(
        registry,
        store,
        toggleSelection(registry.get(store.selection), key),
        orderContaining(store, key, registry.get(pointedTicket)?.remove)
      )
    },
    { preventDefault: false }
  )
  useHotkey(
    "Escape",
    (event) => {
      const target = event.target
      const inList =
        target instanceof Node && root.current?.contains(target) === true
      if (!inList && target !== document.body) return
      if (registry.get(store.count) === 0) return
      registry.set(store.selection, emptySelection)
    },
    { preventDefault: false, stopPropagation: false, conflictBehavior: "allow" }
  )

  return (
    <SelectionContext value={store}>
      <div ref={root} className="contents">
        {children}
        <AnimatePresence>
          {selecting && (
            <SelectionBar
              store={store}
              onClear={() => registry.set(store.selection, emptySelection)}
            />
          )}
        </AnimatePresence>
        <Guide
          open={count > 1 && !guideSeen}
          onClose={() => setGuideSeen(true)}
          steps={[
            {
              target: () => root.current?.querySelector("[data-row-selected]"),
              title: m.tickets_guide_bulk_title({ count }),
              body: m.tickets_guide_bulk_body()
            }
          ]}
          labels={{
            done: m.tickets_guide_done(),
            next: m.common_guide_next(),
            back: m.common_guide_back(),
            skip: m.common_guide_skip(),
            progress: (step, total) => m.common_guide_progress({ step, total })
          }}
        />
      </div>
    </SelectionContext>
  )
}

const guideSeenCodec = createLocalStorageCodec(Schema.Boolean)

const selectionScope = (registry: AtomRegistry, store: SelectionStore) =>
  ({
    removalView: (slug, id) => store.views.get(selectionKey(slug, id))?.remove,
    clearSelection: () => registry.set(store.selection, emptySelection),
    updateSelection: (slug, tickets, patch, restore) =>
      applySelected(registry, store, slug, tickets, patch, restore),
    selection: () => {
      const keys = [...registry.get(store.selection).keys]
      const [first] = keys
      if (first === undefined || keys.length < 2) return null
      return {
        slug: projectOfKey(first),
        tickets: keys.flatMap((key) => {
          const ticket = registry.get(store.known).get(key)
          return ticket === undefined ? [] : [ticket]
        })
      }
    }
  }) satisfies CommandScope

export function SelectionOrder({
  entries,
  children
}: Readonly<{ entries: ReadonlyArray<SelectionEntry>; children: ReactNode }>) {
  const store = use(SelectionContext)
  const registry = use(RegistryContext)
  const current = useRef(entries)
  useLayoutEffect(() => {
    current.current = entries
    if (store === null) return
    const selection = registry.get(store.selection)
    const known = registry.get(store.known)
    let next: Map<string, SelectedTicket> | undefined
    for (const entry of entries) {
      if (
        selection.keys.has(entry.key) &&
        store.views.get(entry.key)?.bulk !== entry.bulk
      )
        continue
      store.views.set(entry.key, entry)
      if (known.get(entry.key) === entry.ticket) continue
      next ??= new Map(known)
      next.set(entry.key, entry.ticket)
    }
    if (!next) return
    registry.set(store.known, next)
  })
  const [order] = useState(() => () => current.current)
  useLayoutEffect(() => {
    if (store === null) return undefined
    store.orders.add(order)
    return () => {
      store.orders.delete(order)
    }
  }, [store, order])
  return <OrderContext value={order}>{children}</OrderContext>
}

export function useClearSelectionWhen(value: string) {
  const store = use(SelectionContext)
  const registry = use(RegistryContext)
  const previous = useRef(value)
  useEffect(() => {
    if (previous.current === value) return
    previous.current = value
    if (store !== null) registry.set(store.selection, emptySelection)
  }, [registry, store, value])
}

export function useForgetTicket(key: string) {
  const store = use(SelectionContext)
  const registry = use(RegistryContext)
  return (withDescendants: boolean) => {
    if (store === null) return
    if (withDescendants) {
      registry.set(store.selection, emptySelection)
      return
    }
    const current = registry.get(store.selection)
    if (!current.keys.has(key)) return
    const keys = new Set(current.keys)
    keys.delete(key)
    registry.set(store.selection, { ...current, keys })
  }
}

export function useSelectedTickets(key: string) {
  const store = use(SelectionContext)
  const registry = use(RegistryContext)
  return () => {
    if (store === null) return []
    const { keys } = registry.get(store.selection)
    if (!keys.has(key) || keys.size < 2) return []
    return [...keys].flatMap((each) => {
      const ticket = registry.get(store.known).get(each)
      return ticket === undefined ? [] : [ticket]
    })
  }
}

const noCount = Atom.make(0)
const noSelection = Atom.make(emptySelection)
const noKnown = Atom.make<ReadonlyMap<string, SelectedTicket>>(new Map())

export function useSelectionStore() {
  return use(SelectionContext)
}

export function useSelectionActions(key: string) {
  const store = use(SelectionContext)
  const registry = use(RegistryContext)
  const selected = useAtomValue(
    store === null ? notSelected : store.isSelected(key)
  )
  // Only a selected row follows the whole selection (its size, keys and
  // tickets): every other row watches just its own flag, so an edit to the
  // selected tickets, or selecting another row, doesn't render the whole
  // list again.
  const watching = store !== null && selected ? store : null
  const size = useAtomValue(watching === null ? noCount : watching.count)
  const acting = watching !== null && size > 1
  const { keys } = useAtomValue(acting ? watching.selection : noSelection)
  const known = useAtomValue(acting ? watching.known : noKnown)
  const selectedTickets = acting
    ? [...keys].flatMap((each) => known.get(each) ?? [])
    : []
  const selectedIds = () =>
    store === null
      ? []
      : [...registry.get(store.selection).keys].flatMap(
          (each) => registry.get(store.known).get(each)?.id ?? []
        )
  const patchBulk = (patch: BulkTicketPatch) => {
    if (!acting) return false
    void applySelected(
      registry,
      watching,
      projectOfKey(key),
      selectedIds(),
      patch
    )
    return true
  }
  return {
    count: acting ? size : 1,
    selectedTickets,
    selectedIds,
    clear: () => {
      if (store !== null) registry.set(store.selection, emptySelection)
    },
    patch: (edit: TicketEdit) => patchBulk(toBulkPatch(edit)),
    patchBulk
  }
}

export function useTicketSelection(key: string) {
  const store = use(SelectionContext)
  const order = use(OrderContext)
  const registry = use(RegistryContext)
  const selected = useAtomValue(
    store === null ? notSelected : store.isSelected(key)
  )
  if (store === null) return null
  return {
    selected,
    toggle: (extend: boolean) => {
      const entries = order?.()
      selectFromOrder(
        registry,
        store,
        toggleSelection(
          registry.get(store.selection),
          key,
          extend ? entries?.map((entry) => entry.key) : undefined
        ),
        entries
      )
    }
  }
}
