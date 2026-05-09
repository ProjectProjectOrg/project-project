import { createContext, use, useCallback, useMemo, useState } from "react"
import type { TagName } from "@projectproject/shared"

type ProjectKey = string
type RenameMap = ReadonlyMap<TagName, TagName>
type RemovedSet = ReadonlySet<TagName>

type Ctx = {
  renamesFor: (key: ProjectKey) => RenameMap
  removedFor: (key: ProjectKey) => RemovedSet
  registerRename: (key: ProjectKey, oldName: TagName, newName: TagName) => void
  registerRemove: (key: ProjectKey, name: TagName) => void
  unregisterRemove: (key: ProjectKey, name: TagName) => void
}

const EMPTY_MAP: RenameMap = new Map()
const EMPTY_SET: RemovedSet = new Set()

const TagRenamesContext = createContext<Ctx | null>(null)

export function TagRenamesProvider({
  children
}: {
  children: React.ReactNode
}) {
  const [renames, setRenames] = useState<
    Map<ProjectKey, Map<TagName, TagName>>
  >(() => new Map())
  const [removed, setRemoved] = useState<Map<ProjectKey, Set<TagName>>>(
    () => new Map()
  )

  const value = useMemo<Ctx>(
    () => ({
      renamesFor: (key) => renames.get(key) ?? EMPTY_MAP,
      removedFor: (key) => removed.get(key) ?? EMPTY_SET,
      registerRename: (key, oldName, newName) =>
        setRenames((prev) => {
          const prevForKey = prev.get(key) ?? new Map<TagName, TagName>()
          const nextForKey = new Map(prevForKey)
          nextForKey.set(oldName, newName)
          const next = new Map(prev)
          next.set(key, nextForKey)
          return next
        }),
      registerRemove: (key, name) =>
        setRemoved((prev) => {
          const prevForKey = prev.get(key) ?? new Set<TagName>()
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

  const registerRename = useCallback(
    (oldName: TagName, newName: TagName) =>
      ctx.registerRename(key, oldName, newName),
    [ctx, key]
  )
  const registerRemove = useCallback(
    (name: TagName) => ctx.registerRemove(key, name),
    [ctx, key]
  )
  const unregisterRemove = useCallback(
    (name: TagName) => ctx.unregisterRemove(key, name),
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
