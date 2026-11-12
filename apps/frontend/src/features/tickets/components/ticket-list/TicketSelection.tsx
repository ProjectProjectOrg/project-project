import { RegistryContext, useAtomValue } from "@effect/atom-react"
import type { BulkTicketPatch, TicketId } from "@pp/shared"
import { useParams } from "@tanstack/react-router"
import * as Result from "effect/reactivity/AsyncResult"
import * as Atom from "effect/reactivity/Atom"
import type { AtomRegistry } from "effect/reactivity/AtomRegistry"
import { Command, X } from "lucide-react"
import { AnimatePresence, motion, useIsPresent } from "motion/react"
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

import { fireMutation } from "@/api/viewMutation"
import { Button } from "@/components/ui/button"
import { Freeze } from "@/components/ui/freeze"
import { commandMenuState } from "@/features/command-menu/atoms/commandMenu"
import { useCommandScope } from "@/features/command-menu/hooks/useCommandScope"
import {
  openCommandMenu,
  type SelectedTicket
} from "@/features/command-menu/lib/commandMenu"
import type { CommandScope } from "@/features/command-menu/lib/commandScopes"
import {
  statusesFor,
  statusesRequest
} from "@/features/projects/atoms/projectStatuses"
import type { BulkTicketUpdateAtom } from "@/features/tickets/atoms/ticketRows"
import { statusMetaFor } from "@/features/tickets/lib/ticketMeta"
import {
  toBulkPatch,
  type TicketEdit
} from "@/features/tickets/lib/ticketPatch"
import {
  emptySelection,
  projectOfKey,
  selectionKey,
  suggestedStatus,
  toggleSelection,
  type TicketSelection
} from "@/features/tickets/lib/ticketSelection"
import { transitions } from "@/lib/springs"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

type SelectionFailure = Readonly<{ count: number; retry: () => void }>

const makeStore = () => {
  const selection = Atom.make<TicketSelection>(emptySelection)
  return {
    selection,
    count: Atom.map(selection, ({ keys }) => keys.size),
    isSelected: Atom.family((key: string) =>
      Atom.map(selection, ({ keys }) => keys.has(key))
    ),
    failure: Atom.make<SelectionFailure | null>(null),
    known: new Map<string, SelectedTicket>(),
    views: new Map<string, BulkTicketUpdateAtom>()
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

const updateSelected = (
  registry: AtomRegistry,
  store: SelectionStore,
  slug: string,
  tickets: ReadonlyArray<TicketId>,
  patch: BulkTicketPatch
) => {
  const byView = new Map<BulkTicketUpdateAtom, Array<TicketId>>()
  for (const id of tickets) {
    const view = store.views.get(selectionKey(slug, id))
    if (view !== undefined) byView.set(view, [...(byView.get(view) ?? []), id])
  }
  registry.set(store.failure, null)
  for (const [view, ids] of byView) {
    void fireMutation(registry, view, { tickets: ids, patch }).then(
      (result) => {
        if (!Result.isFailure(result)) return
        registry.set(store.failure, {
          count: ids.length,
          retry: () => updateSelected(registry, store, slug, ids, patch)
        })
      }
    )
  }
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
          <SelectionActions store={store} />
        </Freeze>
        <SelectionFailureNotice store={store} />
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

function SelectionFailureNotice({
  store
}: Readonly<{ store: SelectionStore }>) {
  const failure = useAtomValue(store.failure)
  if (failure === null) return null
  return (
    <>
      <span
        role="alert"
        className="text-body whitespace-nowrap text-destructive"
      >
        {m.tickets_selection_failed({ count: failure.count })}
      </span>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={failure.retry}
      >
        {m.tickets_selection_retry()}
      </Button>
    </>
  )
}

function SelectionActions({ store }: Readonly<{ store: SelectionStore }>) {
  const { orgSlug } = useParams({ strict: false })
  const keys = [...useAtomValue(store.selection).keys]
  const [first] = keys
  if (orgSlug === undefined || first === undefined) return null
  return (
    <SelectionButtons
      store={store}
      orgSlug={orgSlug}
      slug={projectOfKey(first)}
      tickets={keys.flatMap((key) => store.known.get(key) ?? [])}
    />
  )
}

function SelectionButtons({
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
  const result = useAtomValue(statusesFor(statusesRequest(orgSlug, slug)))
  const statuses = Result.isSuccess(result) ? result.value : []
  const next = suggestedStatus(
    tickets.map((ticket) => ticket.status),
    statuses.map((status) => status.slug)
  )
  const [first] = tickets
  const meta = next === null ? null : statusMetaFor(next, statuses)
  const Icon = meta?.icon
  return (
    <>
      {next !== null && meta !== null && Icon !== undefined && (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() =>
            updateSelected(
              registry,
              store,
              slug,
              tickets.map((ticket) => ticket.id),
              { status: next }
            )
          }
        >
          <Icon
            className={cn("size-3.5", meta.className)}
            style={meta.color ? { color: meta.color } : undefined}
            strokeWidth={1.75}
          />
          {m.tickets_selection_move_to({ status: meta.label })}
        </Button>
      )}
      {first !== undefined && (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() =>
            registry.set(
              commandMenuState,
              openCommandMenu(
                { orgSlug, slug, ticketId: first.id },
                "root",
                tickets
              )
            )
          }
        >
          <Command className="size-3.5" strokeWidth={1.75} />
          {m.tickets_selection_actions()}
        </Button>
      )}
    </>
  )
}

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
