import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import * as Atom from "effect/unstable/reactivity/Atom"
import * as Reactivity from "effect/unstable/reactivity/Reactivity"
import {
  TagColor,
  type CreateTagInput,
  type Tag,
  type TagName,
  type TicketId,
  type UpdateTagInput
} from "@projectproject/shared"
import { Api } from "@/api/Api"
import { Keys, projectScope } from "@/api/keys"
import { ticketDetail, ticketRequest } from "./ticketDetail"

export type TagsRequest = {
  readonly params: { readonly orgSlug: string; readonly slug: string }
}

export const tagsRequest = (orgSlug: string, slug: string): TagsRequest => ({
  params: { orgSlug, slug }
})

const scopeOf = (req: TagsRequest) =>
  projectScope(req.params.orgSlug, req.params.slug)

const tagsQuery = (req: TagsRequest) =>
  Api.query("tags", "list", {
    params: req.params,
    timeToLive: "2 minutes",
    reactivityKeys: [Keys.tags(scopeOf(req))]
  })

export const tagsFor = Atom.family((req: TagsRequest) =>
  Atom.optimistic(tagsQuery(req))
)

const tagUsageQuery = (req: TagsRequest) =>
  Api.query("tags", "usageCounts", {
    params: req.params,
    timeToLive: "2 minutes",
    reactivityKeys: [
      Keys.tagUsage(scopeOf(req)),
      Keys.tags(scopeOf(req)),
      Keys.ticketsIn(scopeOf(req)),
      Keys.ticketLists(scopeOf(req))
    ]
  })

export const tagUsage = Atom.family((req: TagsRequest) =>
  Atom.optimistic(tagUsageQuery(req))
)

const makeTagColor = Schema.decodeUnknownSync(TagColor)

export type TagEditorRequest = {
  readonly params: {
    readonly orgSlug: string
    readonly slug: string
    readonly id: TicketId
  }
}

export type AppliedTag = {
  readonly key: TagName
  readonly name: TagName
}

export type TagEditorValue = {
  readonly tags: ReadonlyArray<Tag>
  readonly applied: ReadonlyArray<AppliedTag>
}

export const tagEditorRequest = (
  orgSlug: string,
  slug: string,
  id: TicketId
): TagEditorRequest => ({ params: { orgSlug, slug, id } })

const tagsRequestOf = (req: TagEditorRequest): TagsRequest => ({
  params: { orgSlug: req.params.orgSlug, slug: req.params.slug }
})

const ticketRequestOf = (req: TagEditorRequest) =>
  ticketRequest(req.params.orgSlug, req.params.slug, req.params.id)

const tagEditorQuery = (req: TagEditorRequest) => {
  const tags = tagsFor(tagsRequestOf(req))
  const ticket = ticketDetail(ticketRequestOf(req))
  return Atom.readable(
    (get) =>
      AsyncResult.map(
        AsyncResult.all([get(tags), get(ticket)] as const),
        ([tags, ticket]): TagEditorValue => ({
          tags,
          applied: ticket.tags.map((name) => ({ key: name, name }))
        })
      ),
    (refresh) => {
      refresh(tags)
      refresh(ticket)
    }
  )
}

export const tagEditor = Atom.family((req: TagEditorRequest) =>
  Atom.optimistic(tagEditorQuery(req))
)

const updateEditorValue = (
  value: TagEditorValue,
  name: TagName,
  patch: UpdateTagInput
): TagEditorValue => {
  const nextName = patch.name
  return {
    tags: value.tags.map((tag) =>
      tag.name === name
        ? {
            ...tag,
            name: nextName ?? tag.name,
            color: patch.color ?? tag.color
          }
        : tag
    ),
    applied: value.applied.map((tag) =>
      tag.name === name ? { ...tag, name: nextName ?? tag.name } : tag
    )
  }
}

const deleteEditorTag = (
  value: TagEditorValue,
  name: TagName
): TagEditorValue => ({
  tags: value.tags.filter((tag) => tag.name !== name),
  applied: value.applied.filter((tag) => tag.name !== name)
})

const createEditorTag = (
  value: TagEditorValue,
  input: CreateTagInput
): TagEditorValue => ({
  ...value,
  tags: [
    ...value.tags,
    {
      name: input.name,
      color: input.color ?? makeTagColor("#7c3aed"),
      createdBy: "",
      createdAt: DateTime.toDate(DateTime.nowUnsafe())
    }
  ]
})

const confirmEditorUpdate = (
  value: TagEditorValue,
  name: TagName,
  requestedName: TagName | undefined,
  updated: Tag
): TagEditorValue => ({
  tags: value.tags.map((tag) =>
    tag.name === name || tag.name === requestedName ? updated : tag
  ),
  applied: value.applied.map((tag) =>
    tag.name === name || tag.name === requestedName
      ? { ...tag, name: updated.name }
      : tag
  )
})

export const createTagInEditor = Atom.family((req: TagEditorRequest) =>
  Atom.optimisticFn(tagEditor(req), {
    reducer: (current, input: CreateTagInput) =>
      AsyncResult.map(current, (value) => createEditorTag(value, input)),
    fn: (set) =>
      Api.runtime.fn(
        Effect.fn(function* (input: CreateTagInput, get) {
          const created = yield* Api.use((client) =>
            client.tags.create({
              params: {
                orgSlug: req.params.orgSlug,
                slug: req.params.slug
              },
              payload: input
            })
          )
          set(
            AsyncResult.map(get(tagEditor(req)), (value) => ({
              ...value,
              tags: value.tags.map((tag) =>
                tag.name === input.name ? created : tag
              )
            }))
          )
          yield* Reactivity.invalidate([
            Keys.tagUsage(projectScope(req.params.orgSlug, req.params.slug))
          ])
          return created
        })
      )
  })
)

export const updateTagInEditor = Atom.family(
  ({ req, name }: { readonly req: TagEditorRequest; readonly name: TagName }) =>
    Atom.optimisticFn(tagEditor(req), {
      reducer: (current, patch: UpdateTagInput) =>
        AsyncResult.map(current, (value) =>
          updateEditorValue(value, name, patch)
        ),
      fn: (set) =>
        Api.runtime.fn(
          Effect.fn(function* (patch: UpdateTagInput, get) {
            const updated = yield* Api.use((client) =>
              client.tags.update({
                params: {
                  orgSlug: req.params.orgSlug,
                  slug: req.params.slug,
                  name
                },
                payload: patch
              })
            )
            set(
              AsyncResult.map(get(tagEditor(req)), (value) =>
                confirmEditorUpdate(value, name, patch.name, updated)
              )
            )
            if (patch.name !== undefined && patch.name !== name) {
              const scope = projectScope(req.params.orgSlug, req.params.slug)
              yield* Reactivity.invalidate([
                Keys.tagUsage(scope),
                Keys.ticketsIn(scope),
                Keys.ticketLists(scope),
                Keys.ticketPages(scope)
              ])
            }
            return updated
          })
        )
    })
)

export const deleteTagInEditor = Atom.family(
  ({ req, name }: { readonly req: TagEditorRequest; readonly name: TagName }) =>
    Atom.optimisticFn(tagEditor(req), {
      reducer: (current, _input: void) =>
        AsyncResult.map(current, (value) => deleteEditorTag(value, name)),
      fn: (set) =>
        Api.runtime.fn(
          Effect.fn(function* (_input: void, get) {
            yield* Api.use((client) =>
              client.tags.delete({
                params: {
                  orgSlug: req.params.orgSlug,
                  slug: req.params.slug,
                  name
                }
              })
            )
            set(
              AsyncResult.map(get(tagEditor(req)), (value) =>
                deleteEditorTag(value, name)
              )
            )
            const scope = projectScope(req.params.orgSlug, req.params.slug)
            yield* Reactivity.invalidate([
              Keys.tagUsage(scope),
              Keys.ticketsIn(scope),
              Keys.ticketLists(scope),
              Keys.ticketPages(scope)
            ])
          })
        )
    })
)

export const createTag = Atom.family((req: TagsRequest) =>
  Atom.optimisticFn(tagsFor(req), {
    reducer: (current, input: CreateTagInput) =>
      AsyncResult.map(current, (tags) => {
        const synthetic: Tag = {
          name: input.name,
          color: input.color ?? makeTagColor("#7c3aed"),
          createdBy: "",
          createdAt: DateTime.toDate(DateTime.nowUnsafe())
        }
        return [...tags, synthetic]
      }),
    fn: (set) =>
      Api.runtime.fn(
        Effect.fn(function* (input: CreateTagInput, get) {
          const created = yield* Api.use((client) =>
            client.tags.create({ params: req.params, payload: input })
          )
          set(
            AsyncResult.map(get(tagsFor(req)), (tags) =>
              tags.map((tag) => (tag.name === input.name ? created : tag))
            )
          )
          yield* Reactivity.invalidate([Keys.tagUsage(scopeOf(req))])
          return created
        })
      )
  })
)

export const updateTag = Atom.family(
  ({ req, name }: { readonly req: TagsRequest; readonly name: TagName }) =>
    Atom.optimisticFn(tagsFor(req), {
      reducer: (current, patch: UpdateTagInput) =>
        AsyncResult.map(current, (tags) =>
          tags.map((tag) =>
            tag.name === name
              ? {
                  ...tag,
                  name: patch.name ?? tag.name,
                  color: patch.color ?? tag.color
                }
              : tag
          )
        ),
      fn: (set) =>
        Api.runtime.fn(
          Effect.fn(function* (patch: UpdateTagInput, get) {
            const updated = yield* Api.use((client) =>
              client.tags.update({
                params: { ...req.params, name },
                payload: patch
              })
            )
            set(
              AsyncResult.map(get(tagsFor(req)), (tags) =>
                tags.map((tag) =>
                  tag.name === name || tag.name === patch.name ? updated : tag
                )
              )
            )
            if (patch.name !== undefined && patch.name !== name) {
              yield* Reactivity.invalidate([
                Keys.tagUsage(scopeOf(req)),
                Keys.ticketsIn(scopeOf(req)),
                Keys.ticketLists(scopeOf(req)),
                Keys.ticketPages(scopeOf(req))
              ])
            }
            return updated
          })
        )
    })
)

export const deleteTag = Atom.family(
  ({ req, name }: { readonly req: TagsRequest; readonly name: TagName }) =>
    Atom.optimisticFn(tagsFor(req), {
      reducer: (current, _input: void) =>
        AsyncResult.map(current, (tags) =>
          tags.filter((tag) => tag.name !== name)
        ),
      fn: (set) =>
        Api.runtime.fn(
          Effect.fn(function* (_input: void, get) {
            yield* Api.use((client) =>
              client.tags.delete({ params: { ...req.params, name } })
            )
            set(
              AsyncResult.map(get(tagsFor(req)), (tags) =>
                tags.filter((tag) => tag.name !== name)
              )
            )
            yield* Reactivity.invalidate([
              Keys.tagUsage(scopeOf(req)),
              Keys.ticketsIn(scopeOf(req)),
              Keys.ticketLists(scopeOf(req)),
              Keys.ticketPages(scopeOf(req))
            ])
          })
        )
    })
)
