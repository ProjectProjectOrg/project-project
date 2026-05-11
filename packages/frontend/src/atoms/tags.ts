import { Atom, Result } from "@effect-atom/atom-react"
import { Schema } from "effect"
import { AppApiClient } from "@/services/AppApiClient"
import { ReactivityKey } from "@/atoms/reactivity-keys"
import { tagsKey, type ProjectKey } from "@/atoms/keys"
import { TagColor, type Tag } from "@projectproject/shared"

export { tagsKey }

const makeTagColor = Schema.decodeUnknownSync(TagColor)

const tagsBaseAtom = Atom.family(({ orgSlug, slug }: ProjectKey) =>
  AppApiClient.query("tags", "list", {
    path: { orgSlug, slug },
    reactivityKeys: [ReactivityKey.tags]
  })
)

export const tagsAtom = Atom.family((key: ProjectKey) =>
  Atom.optimistic(tagsBaseAtom(key))
)

const createTag = AppApiClient.mutation("tags", "create")
const updateTag = AppApiClient.mutation("tags", "update")
const removeTag = AppApiClient.mutation("tags", "delete")

export const createTagAtom = Atom.family((key: ProjectKey) =>
  tagsAtom(key).pipe(
    Atom.optimisticFn({
      reducer: (current, arg) => {
        if (!Result.isSuccess(current)) return current
        const synthetic: Tag = {
          name: arg.payload.name,
          color: arg.payload.color ?? makeTagColor("#7c3aed"),
          createdBy: "",
          createdAt: new Date()
        }
        return Result.success([...current.value, synthetic], { waiting: true })
      },
      fn: createTag
    })
  )
)

export const renameTagAtom = Atom.family((key: ProjectKey) =>
  tagsAtom(key).pipe(
    Atom.optimisticFn({
      reducer: (current, arg) => {
        if (!Result.isSuccess(current)) return current
        const next = current.value.map((t) =>
          t.name === arg.path.name
            ? {
                ...t,
                name: arg.payload.name ?? t.name,
                color: arg.payload.color ?? t.color
              }
            : t
        )
        return Result.success(next, { waiting: true })
      },
      fn: updateTag
    })
  )
)

export const deleteTagAtom = Atom.family((key: ProjectKey) =>
  tagsAtom(key).pipe(
    Atom.optimisticFn({
      reducer: (current, arg) =>
        Result.isSuccess(current)
          ? Result.success(
              current.value.filter((tag) => tag.name !== arg.path.name),
              { waiting: true }
            )
          : current,
      fn: removeTag
    })
  )
)
  )
)
