import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState
} from "react"
import { Result, useAtomValue } from "@effect-atom/atom-react"
import { tagsAtom, tagsKey } from "@/atoms/tags"

type ProjectKey = string
type RenameMap = ReadonlyMap<string, string>
type RemovedSet = ReadonlySet<string>

type Ctx = {
  renamesFor: (key: ProjectKey) => RenameMap
  removedFor: (key: ProjectKey) => RemovedSet
  registerRename: (key: ProjectKey, oldName: string, newName: string) => void
  registerRemove: (key: ProjectKey, name: string) => void
  unregisterRemove: (key: ProjectKey, name: string) => void
}

const EMPTY_MAP: RenameMap = new Map()
const EMPTY_SET: RemovedSet = new Set()

const TagRenamesContext = createContext<Ctx | null>(null)

export function TagRenamesProvider({
  children
}: {
  children: React.ReactNode
}) {
  const [renames, setRenames] = useState<Map<ProjectKey, Map<string, string>>>(
    () => new Map()
  )
  const [removed, setRemoved] = useState<Map<ProjectKey, Set<string>>>(
    () => new Map()
  )

  const value = useMemo<Ctx>(
    () => ({
      renamesFor: (key) => renames.get(key) ?? EMPTY_MAP,
      removedFor: (key) => removed.get(key) ?? EMPTY_SET,
      registerRename: (key, oldName, newName) =>
        setRenames((prev) => {
          const prevForKey = prev.get(key) ?? new Map<string, string>()
          const nextForKey = new Map(prevForKey)
          nextForKey.set(oldName, newName)
          const next = new Map(prev)
          next.set(key, nextForKey)
          return next
        }),
      registerRemove: (key, name) =>
        setRemoved((prev) => {
          const prevForKey = prev.get(key) ?? new Set<string>()
          if (prevForKey.has(name)) return prev
          const nextForKey = new Set(prevForKey)
          nextForKey.add(name)
          const next = new Map(prev)
          next.set(key, nextForKey)
          return next
        }),
      unregisterRemove: (key, name) =>
        setRemoved((prev) => {
          const prevForKey = prev.get(key)
          if (!prevForKey?.has(name)) return prev
          const nextForKey = new Set(prevForKey)
          nextForKey.delete(name)
          const next = new Map(prev)
          next.set(key, nextForKey)
          return next
        })
    }),
    [renames, removed]
  )

  return <TagRenamesContext value={value}>{children}</TagRenamesContext>
}

export function useTagRenames(orgSlug: string, slug: string) {
  const ctx = use(TagRenamesContext)
  if (!ctx) {
    throw new Error("useTagRenames must be used inside <TagRenamesProvider>")
  }
  const key = `${orgSlug}/${slug}`
  const renames = ctx.renamesFor(key)
  const removed = ctx.removedFor(key)
  const tagsResult = useAtomValue(tagsAtom(tagsKey(orgSlug, slug)))

  useEffect(() => {
    if (!Result.isSuccess(tagsResult)) return
    if (renames.size === 0 && removed.size === 0) return
    const registryNames = new Set<string>(
      tagsResult.value.map((t) => t.name)
    )
    for (const oldName of renames.keys()) {
      if (!registryNames.has(oldName)) {
        // best-effort: clear once the old name is no longer in the registry
      }
    }
    for (const name of removed) {
      if (!registryNames.has(name)) {
        ctx.unregisterRemove(key, name)
      }
    }
  }, [tagsResult, renames, removed, ctx, key])

  const registerRename = useCallback(
    (oldName: string, newName: string) =>
      ctx.registerRename(key, oldName, newName),
    [ctx, key]
  )
  const registerRemove = useCallback(
    (name: string) => ctx.registerRemove(key, name),
    [ctx, key]
  )
  const unregisterRemove = useCallback(
    (name: string) => ctx.unregisterRemove(key, name),
    [ctx, key]
  )

  return {
    renameMap: renames,
    removed,
    registerRename,
    registerRemove,
    unregisterRemove
  }
}
