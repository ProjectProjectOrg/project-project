import * as Schema from "effect/Schema"
import { useCallback, useMemo, useRef, useSyncExternalStore } from "react"
import { useLocalStorageSelect } from "@/hooks/useLocalStorageState"

const ListSchema = Schema.Array(Schema.String)
const RecordSchema = Schema.Record(Schema.String, Schema.Boolean)
const EMPTY_LIST: ReadonlyArray<string> = []
const EMPTY_RECORD: Readonly<Record<string, boolean>> = {}

export const statusCollapseKey = (orgSlug: string, slug: string) =>
  `projectproject:ticket-list-collapsed:${orgSlug}/${slug}`

export const sprintCollapseKey = (preferencesKey: string) =>
  `projectproject:sprint-sections-collapsed:${preferencesKey}`

type MemorySnapshot = Readonly<{
  q: string | undefined
  list: ReadonlyArray<string>
  record: Readonly<Record<string, boolean>>
}>

const memory = new Map<string, MemorySnapshot>()
const memoryListeners = new Map<string, Set<() => void>>()

const emptyMemory: MemorySnapshot = {
  q: undefined,
  list: EMPTY_LIST,
  record: EMPTY_RECORD
}

function getMemory(key: string): MemorySnapshot {
  return memory.get(key) ?? emptyMemory
}

function setMemory(key: string, next: MemorySnapshot): void {
  memory.set(key, next)
  const set = memoryListeners.get(key)
  if (set) for (const listener of set) listener()
}

function subscribeMemory(key: string, onStoreChange: () => void): () => void {
  let set = memoryListeners.get(key)
  if (!set) {
    set = new Set()
    memoryListeners.set(key, set)
  }
  set.add(onStoreChange)
  return () => {
    set.delete(onStoreChange)
    if (set.size === 0) memoryListeners.delete(key)
  }
}

function toggleInList(
  ids: ReadonlyArray<string>,
  id: string
): ReadonlyArray<string> {
  return ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id]
}

function useMemorySelect<T>(
  key: string,
  select: (value: MemorySnapshot) => T
): readonly [T, (update: (current: MemorySnapshot) => MemorySnapshot) => void] {
  const selectRef = useRef(select)
  selectRef.current = select
  const subscribe = useCallback(
    (onStoreChange: () => void) => subscribeMemory(key, onStoreChange),
    [key]
  )
  const getSnapshot = useCallback(
    () => selectRef.current(getMemory(key)),
    [key]
  )
  const getServerSnapshot = useCallback(
    () => selectRef.current(emptyMemory),
    []
  )
  const value = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  const write = useCallback(
    (update: (current: MemorySnapshot) => MemorySnapshot) => {
      setMemory(key, update(getMemory(key)))
    },
    [key]
  )
  return useMemo(() => [value, write] as const, [value, write])
}

export function useCollapsedInSet(
  persistKey: string,
  id: string,
  searchQuery: string | undefined
): readonly [boolean, () => void] {
  const [persisted, setPersisted] = useLocalStorageSelect(
    persistKey,
    ListSchema,
    EMPTY_LIST,
    (ids) => ids.includes(id)
  )
  const [memoryCollapsed, setMemorySnapshot] = useMemorySelect(
    persistKey,
    (snapshot) => snapshot.list.includes(id)
  )
  const collapsed = searchQuery ? memoryCollapsed : persisted
  const toggle = useCallback(() => {
    if (searchQuery) {
      setMemorySnapshot((current) => ({
        ...current,
        list: toggleInList(current.list, id)
      }))
      return
    }
    setPersisted((ids) => toggleInList(ids, id))
  }, [id, searchQuery, setMemorySnapshot, setPersisted])
  return [collapsed, toggle]
}

export function useCollapsedInRecord(
  persistKey: string,
  id: string,
  searchQuery: string | undefined,
  defaultCollapsed: boolean
): readonly [boolean, () => void] {
  const [persisted, setPersisted] = useLocalStorageSelect(
    persistKey,
    RecordSchema,
    EMPTY_RECORD,
    (record) => record[id] ?? defaultCollapsed
  )
  const [memoryCollapsed, setMemorySnapshot] = useMemorySelect(
    persistKey,
    (snapshot) =>
      snapshot.q === searchQuery ? (snapshot.record[id] ?? false) : false
  )
  const collapsed = searchQuery ? memoryCollapsed : persisted
  const toggle = useCallback(() => {
    if (searchQuery) {
      setMemorySnapshot((current) => {
        const record = current.q === searchQuery ? current.record : EMPTY_RECORD
        const isCollapsed = record[id] ?? false
        return {
          q: searchQuery,
          list: current.list,
          record: { ...record, [id]: !isCollapsed }
        }
      })
      return
    }
    setPersisted((record) => ({
      ...record,
      [id]: !(record[id] ?? defaultCollapsed)
    }))
  }, [defaultCollapsed, id, searchQuery, setMemorySnapshot, setPersisted])
  return [collapsed, toggle]
}

export function resetSectionCollapseMemory(): void {
  memory.clear()
}
