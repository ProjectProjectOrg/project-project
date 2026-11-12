import { RegistryContext, useAtomValue } from "@effect/atom-react"
import * as Atom from "effect/reactivity/Atom"
import { X } from "lucide-react"
import { AnimatePresence, motion, useIsPresent } from "motion/react"
import {
  createContext,
  use,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode
} from "react"

import { Button } from "@/components/ui/button"
import { Freeze } from "@/components/ui/freeze"
import {
  emptySelection,
  toggleSelection,
  type TicketSelection
} from "@/features/tickets/lib/ticketSelection"
import { transitions } from "@/lib/springs"
import { m } from "@/paraglide/messages"

const makeStore = () => {
  const selection = Atom.make<TicketSelection>(emptySelection)
  return {
    selection,
    count: Atom.map(selection, ({ keys }) => keys.size),
    isSelected: Atom.family((key: string) =>
      Atom.map(selection, ({ keys }) => keys.has(key))
    )
  }
}

type SelectionStore = ReturnType<typeof makeStore>

const SelectionContext = createContext<SelectionStore | null>(null)
const OrderContext = createContext<(() => ReadonlyArray<string>) | null>(null)
const notSelected = Atom.make(false)

export function TicketSelectionProvider({
  resetKey,
  children
}: Readonly<{ resetKey: string; children: ReactNode }>) {
  const [store, setStore] = useState(makeStore)
  const [storeKey, setStoreKey] = useState(resetKey)
  if (storeKey !== resetKey) {
    setStoreKey(resetKey)
    setStore(makeStore())
  }
  const registry = use(RegistryContext)
  const selecting = useAtomValue(store.count) > 0
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

function SelectionBar({
  store,
  onClear
}: Readonly<{ store: SelectionStore; onClear: () => void }>) {
  const count = useAtomValue(store.count)
  const present = useIsPresent()
  return (
    <div className="pointer-events-none sticky bottom-6 z-30 flex h-0 items-end justify-center">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 8 }}
        transition={transitions.presence}
        className="pointer-events-auto flex h-11 shrink-0 items-center gap-2 rounded-2xl bg-surface-5 pr-1.5 pl-4 shadow-surface-6"
      >
        <Freeze frozen={!present}>
          <output className="text-body whitespace-nowrap text-foreground tabular-nums">
            {m.tickets_selection_count({ count })}
          </output>
        </Freeze>
        <Button
          type="button"
          variant="quiet"
          size="square-8"
          onClick={onClear}
          aria-label={m.tickets_selection_clear_aria_label()}
          title={m.tickets_selection_clear_aria_label()}
        >
          <X className="size-4" strokeWidth={1.75} />
        </Button>
      </motion.div>
    </div>
  )
}

const isEditable = (element: HTMLElement) =>
  element.isContentEditable ||
  element instanceof HTMLInputElement ||
  element instanceof HTMLTextAreaElement

export function SelectionOrder({
  keys,
  children
}: Readonly<{ keys: ReadonlyArray<string>; children: ReactNode }>) {
  const current = useRef(keys)
  useLayoutEffect(() => {
    current.current = keys
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
  return () => {
    if (store === null) return
    const current = registry.get(store.selection)
    if (!current.keys.has(key)) return
    const keys = new Set(current.keys)
    keys.delete(key)
    registry.set(store.selection, { ...current, keys })
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
