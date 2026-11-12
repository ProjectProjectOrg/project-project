import { RegistryContext, useAtomValue } from "@effect/atom-react"
import type { BulkTicketPatch } from "@pp/shared"
import * as Atom from "effect/reactivity/Atom"
import type { AtomRegistry } from "effect/reactivity/AtomRegistry"
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

import { useCommandScope } from "@/features/command-menu/hooks/useCommandScope"
import type { SelectedTicket } from "@/features/command-menu/lib/commandMenu"
import type { CommandScope } from "@/features/command-menu/lib/commandScopes"
import type { BulkTicketUpdateAtom } from "@/features/tickets/atoms/ticketRows"
import {
  toBulkPatch,
  type TicketEdit
} from "@/features/tickets/lib/ticketPatch"
import {
  emptySelection,
  projectOfKey,
  toggleSelection
} from "@/features/tickets/lib/ticketSelection"

import { SelectionBar } from "./SelectionBar"
import {
  createSelectionStore,
  type SelectionStore,
  updateSelected
} from "./selectionStore"

const SelectionContext = createContext<SelectionStore | null>(null)
const OrderContext = createContext<(() => ReadonlyArray<string>) | null>(null)
const notSelected = Atom.make(false)

export function TicketSelectionProvider({
  resetKey,
  children
}: Readonly<{ resetKey: string; children: ReactNode }>) {
  const [store, setStore] = useState(createSelectionStore)
  const [storeKey, setStoreKey] = useState(resetKey)
  if (storeKey !== resetKey) {
    setStoreKey(resetKey)
    setStore(createSelectionStore())
  }
  const registry = use(RegistryContext)
  const selecting = useAtomValue(store.count) > 0
  const scope = useMemo(
    () => selectionScope(registry, store),
    [registry, store]
  )
  useCommandScope(scope)
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target
      if (event.defaultPrevented || !(target instanceof HTMLElement)) return
      const inList = root.current?.contains(target) === true
      if (event.key === "Escape" && (inList || target === document.body)) {
        registry.set(store.selection, emptySelection)
        return
      }
      const row = target.closest<HTMLElement>("[data-selection-key]")
      if (
        event.key !== "x" ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        !inList ||
        row === null ||
        isEditable(target)
      ) {
        return
      }
      event.preventDefault()
      registry.set(
        store.selection,
        toggleSelection(
          registry.get(store.selection),
          row.dataset.selectionKey ?? ""
        )
      )
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [registry, store])

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
      </div>
    </SelectionContext>
  )
}

const selectionScope = (
  registry: AtomRegistry,
  store: SelectionStore
): CommandScope => ({
  clearSelection: () => registry.set(store.selection, emptySelection),
  updateSelection: (slug, tickets, patch) =>
    updateSelected(registry, store, slug, tickets, patch),
  selection: () => {
    const keys = [...registry.get(store.selection).keys]
    const [first] = keys
    if (first === undefined || keys.length < 2) return null
    return {
      slug: projectOfKey(first),
      tickets: keys.flatMap((key) => {
        const ticket = store.known.get(key)
        return ticket === undefined ? [] : [ticket]
      })
    }
  }
})

const isEditable = (element: HTMLElement) =>
  element.isContentEditable ||
  element instanceof HTMLInputElement ||
  element instanceof HTMLTextAreaElement

export type SelectionEntry = Readonly<{
  key: string
  ticket: SelectedTicket
  bulk: BulkTicketUpdateAtom
}>

export function SelectionOrder({
  entries,
  children
}: Readonly<{ entries: ReadonlyArray<SelectionEntry>; children: ReactNode }>) {
  const store = use(SelectionContext)
  const current = useRef<ReadonlyArray<string>>([])
  useLayoutEffect(() => {
    current.current = entries.map(({ key }) => key)
    for (const { key, ticket, bulk } of entries) {
      store?.known.set(key, ticket)
      store?.views.set(key, bulk)
    }
  })
  const [order] = useState(() => () => current.current)
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

export function useSelectedTickets(
  key: string
): () => ReadonlyArray<SelectedTicket> {
  const store = use(SelectionContext)
  const registry = use(RegistryContext)
  return () => {
    if (store === null) return []
    const { keys } = registry.get(store.selection)
    if (!keys.has(key) || keys.size < 2) return []
    return [...keys].flatMap((each) => {
      const ticket = store.known.get(each)
      return ticket === undefined ? [] : [ticket]
    })
  }
}

const noCount = Atom.make(0)
const noSelection = Atom.make(emptySelection)

export function useSelectionActions(key: string) {
  const store = use(SelectionContext)
  const registry = use(RegistryContext)
  const size = useAtomValue(store === null ? noCount : store.count)
  const selected = useAtomValue(
    store === null ? notSelected : store.isSelected(key)
  )
  const acting = store !== null && selected && size > 1
  const { keys } = useAtomValue(store === null ? noSelection : store.selection)
  const selectedTickets = acting
    ? [...keys].flatMap((each) => store.known.get(each) ?? [])
    : []
  const selectedIds = () =>
    store === null
      ? []
      : [...registry.get(store.selection).keys].flatMap(
          (each) => store.known.get(each)?.id ?? []
        )
  const patchBulk = (patch: BulkTicketPatch): boolean => {
    if (!acting) return false
    updateSelected(registry, store, projectOfKey(key), selectedIds(), patch)
    return true
  }
  return {
    count: acting ? size : 1,
    selectedTickets,
    selectedIds,
    clear: () => {
      if (store !== null) registry.set(store.selection, emptySelection)
    },
    patch: (edit: TicketEdit): boolean => patchBulk(toBulkPatch(edit)),
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
    toggle: (extend: boolean) =>
      registry.set(
        store.selection,
        toggleSelection(
          registry.get(store.selection),
          key,
          extend ? order?.() : undefined
        )
      )
  }
}
