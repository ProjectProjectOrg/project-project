import { Atom, Result } from "@effect-atom/atom-react"
import { Effect } from "effect"
import { runtime } from "@/runtime"
import { ApiClient } from "@/services/ApiClient"
import { ticketsListAtom, ticketsListKey } from "@/atoms/tickets"
import type {
  CreateTagInput,
  Tag,
  TagName,
  UpdateTagInput
} from "@projectproject/shared"

export const tagsKey = (orgSlug: string, slug: string) => `${orgSlug}/${slug}`

const tagsBaseAtom = Atom.family((key: string) => {
  const idx = key.indexOf("/")
  const orgSlug = key.slice(0, idx)
  const slug = key.slice(idx + 1)
  return runtime
    .atom(
      Effect.gen(function* () {
        const client = yield* ApiClient
        return yield* client.tags.list({ path: { orgSlug, slug } })
      })
    )
    .pipe(Atom.setIdleTTL("2 minutes"))
})

export const tagsAtom = Atom.family((key: string) =>
  Atom.optimistic(tagsBaseAtom(key))
)

export const createTagAtom = Atom.family((key: string) => {
  const idx = key.indexOf("/")
  const orgSlug = key.slice(0, idx)
  const slug = key.slice(idx + 1)
  return Atom.optimisticFn(tagsAtom(key), {
    reducer: (current, input: CreateTagInput) => {
      if (!Result.isSuccess(current)) return current
      const synthetic: Tag = {
        name: input.name,
        color: (input.color ?? "#7c3aed") as Tag["color"],
        createdBy: "",
        createdAt: new Date()
      }
      return Result.success([...current.value, synthetic], { waiting: true })
    },
    fn: runtime.fn(
      Effect.fn(function* (input: CreateTagInput, get) {
        const client = yield* ApiClient
        const tag = yield* client.tags.create({
          path: { orgSlug, slug },
          payload: input
        })
        get.refresh(tagsBaseAtom(key))
        return tag
      })
    )
  })
})

type RenameInput = {
  oldName: TagName
  nextName?: TagName
  color?: Tag["color"]
}
export const renameTagAtom = Atom.family((key: string) => {
  const idx = key.indexOf("/")
  const orgSlug = key.slice(0, idx)
  const slug = key.slice(idx + 1)
  return Atom.optimisticFn(tagsAtom(key), {
    reducer: (current, _input: RenameInput) =>
      Result.isSuccess(current)
        ? Result.success(current.value, { waiting: true })
        : current,
    fn: runtime.fn(
      Effect.fn(function* (input: RenameInput, get) {
        const client = yield* ApiClient
        const patch: UpdateTagInput = {
          ...(input.nextName ? { name: input.nextName } : {}),
          ...(input.color ? { color: input.color } : {})
        }
        const tag = yield* client.tags.update({
          path: { orgSlug, slug, name: input.oldName },
          payload: patch
        })
        get.refresh(tagsBaseAtom(key))
        get.refresh(ticketsListAtom(ticketsListKey(orgSlug, slug)))
        return tag
      })
    )
  })
})

type DeleteInput = { name: TagName; force: boolean }
export const deleteTagAtom = Atom.family((key: string) => {
  const idx = key.indexOf("/")
  const orgSlug = key.slice(0, idx)
  const slug = key.slice(idx + 1)
  return Atom.optimisticFn(tagsAtom(key), {
    reducer: (current, _input: DeleteInput) =>
      Result.isSuccess(current)
        ? Result.success(current.value, { waiting: true })
        : current,
    fn: runtime.fn(
      Effect.fn(function* (input: DeleteInput, get) {
        const client = yield* ApiClient
        yield* client.tags.delete({
          path: { orgSlug, slug, name: input.name },
          urlParams: input.force ? { force: true } : {}
        })
        get.refresh(tagsBaseAtom(key))
        get.refresh(ticketsListAtom(ticketsListKey(orgSlug, slug)))
      })
    )
  })
})
