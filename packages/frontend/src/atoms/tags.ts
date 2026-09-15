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
  type UpdateTagInput
} from "@projectproject/shared"
import { Api } from "@/api/Api"
import { Keys, projectScope } from "@/api/keys"

export interface TagsRequest {
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
      Keys.tags(scopeOf(req)),
      Keys.ticketsIn(scopeOf(req)),
      Keys.ticketLists(scopeOf(req))
    ]
  })

export const tagUsage = Atom.family((req: TagsRequest) =>
  Atom.optimistic(tagUsageQuery(req))
)

const makeTagColor = Schema.decodeUnknownSync(TagColor)

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
              Keys.ticketsIn(scopeOf(req)),
              Keys.ticketLists(scopeOf(req)),
              Keys.ticketPages(scopeOf(req))
            ])
          })
        )
    })
)
