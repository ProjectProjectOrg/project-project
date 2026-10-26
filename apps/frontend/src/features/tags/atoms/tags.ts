import {
  TagColor,
  type CreateTagInput,
  type Tag,
  type TagName,
  type TicketId,
  type UpdateTagInput
} from "@pp/shared"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import * as Atom from "effect/reactivity/Atom"
import * as Schema from "effect/Schema"

import { Api } from "@/api/Api"
import { Keys, projectScope } from "@/api/keys"
import { viewMutation } from "@/api/viewMutation"
import {
  ticketQuery,
  ticketRequest
} from "@/features/tickets/atoms/ticketDetail"

export type TagsRequest = Readonly<{
  _view: "tags"
  params: Readonly<{ orgSlug: string; slug: string }>
}>

export const tagsRequest = (orgSlug: string, slug: string): TagsRequest => ({
  _view: "tags",
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

export type TagEditorRequest = Readonly<{
  _view: "tagEditor"
  params: Readonly<{
    orgSlug: string
    slug: string
    id: TicketId
  }>
}>

export type AppliedTag = Readonly<{
  key: TagName
  name: TagName
}>

export type TagEditorValue = Readonly<{
  tags: ReadonlyArray<Tag>
  applied: ReadonlyArray<AppliedTag>
}>

export const tagEditorRequest = (
  orgSlug: string,
  slug: string,
  id: TicketId
): TagEditorRequest => ({ _view: "tagEditor", params: { orgSlug, slug, id } })

const tagsRequestOf = (req: TagEditorRequest) =>
  tagsRequest(req.params.orgSlug, req.params.slug)

const ticketRequestOf = (req: TagEditorRequest) =>
  ticketRequest(req.params.orgSlug, req.params.slug, req.params.id)

const tagEditorQuery = (req: TagEditorRequest) => {
  const tags = tagsQuery(tagsRequestOf(req))
  const ticket = ticketQuery(ticketRequestOf(req))
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

const syntheticTag = (input: CreateTagInput): Tag => ({
  name: input.name,
  color: input.color ?? makeTagColor("#7c3aed"),
  createdBy: "",
  createdAt: DateTime.toDate(DateTime.nowUnsafe())
})

const createEditorTag = (
  value: TagEditorValue,
  input: CreateTagInput
): TagEditorValue => ({
  ...value,
  tags: [...value.tags, syntheticTag(input)]
})

const applyEditorTags = (
  value: TagEditorValue,
  tags: ReadonlyArray<TagName>
): TagEditorValue => ({
  ...value,
  applied: tags.map((name) => ({ key: name, name }))
})

type ApplyTagsInput = Readonly<{
  tags: ReadonlyArray<TagName>
}>

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

const editorScope = (req: TagEditorRequest) =>
  projectScope(req.params.orgSlug, req.params.slug)

const tagsChanged = (scope: string) => [
  Keys.tagUsage(scope),
  ...Keys.ticketsChanged(scope)
]

const renames = (name: TagName, patch: UpdateTagInput) =>
  patch.name !== undefined && patch.name !== name

export const applyTagsInEditor = Atom.family((req: TagEditorRequest) =>
  viewMutation(tagEditor(req), {
    name: "applyTagsInEditor",
    predict: (value, input: ApplyTagsInput) =>
      applyEditorTags(value, input.tags),
    call: (client, input) =>
      client.tickets
        .update({
          params: req.params,
          query: {},
          payload: { tags: input.tags }
        })
        .pipe(Effect.map(({ ticket }) => ticket)),
    confirm: (value, updated) => applyEditorTags(value, updated.tags),
    publish: () => tagsChanged(editorScope(req))
  })
)

export const createTagInEditor = Atom.family((req: TagEditorRequest) =>
  viewMutation(tagEditor(req), {
    name: "createTagInEditor",
    predict: createEditorTag,
    call: (client, input) =>
      client.tags.create({
        params: { orgSlug: req.params.orgSlug, slug: req.params.slug },
        payload: input
      }),
    confirm: (value, created, input) => ({
      ...value,
      tags: value.tags.map((tag) => (tag.name === input.name ? created : tag))
    }),
    publish: () => [Keys.tagUsage(editorScope(req))]
  })
)

type EditorTagKey = Readonly<{ req: TagEditorRequest; name: TagName }>

export const updateTagInEditor = Atom.family(({ req, name }: EditorTagKey) =>
  viewMutation(tagEditor(req), {
    name: "updateTagInEditor",
    predict: (value, patch: UpdateTagInput) =>
      updateEditorValue(value, name, patch),
    call: (client, patch) =>
      client.tags.update({
        params: {
          orgSlug: req.params.orgSlug,
          slug: req.params.slug,
          name
        },
        payload: patch
      }),
    confirm: (value, updated, patch) =>
      confirmEditorUpdate(value, name, patch.name, updated),
    publish: (_updated, patch) =>
      renames(name, patch) ? tagsChanged(editorScope(req)) : []
  })
)

export const deleteTagInEditor = Atom.family(({ req, name }: EditorTagKey) =>
  viewMutation(tagEditor(req), {
    name: "deleteTagInEditor",
    predict: (value, _input: void) => deleteEditorTag(value, name),
    call: (client) =>
      client.tags.delete({
        params: {
          orgSlug: req.params.orgSlug,
          slug: req.params.slug,
          name
        }
      }),
    confirm: (value) => deleteEditorTag(value, name),
    publish: () => tagsChanged(editorScope(req))
  })
)

export const createTag = Atom.family((req: TagsRequest) =>
  viewMutation(tagsFor(req), {
    name: "createTag",
    predict: (tags, input: CreateTagInput) => [...tags, syntheticTag(input)],
    call: (client, input) =>
      client.tags.create({ params: req.params, payload: input }),
    confirm: (tags, created, input) =>
      tags.map((tag) => (tag.name === input.name ? created : tag)),
    publish: () => [Keys.tagUsage(scopeOf(req))]
  })
)

type TagKey = Readonly<{ req: TagsRequest; name: TagName }>

export const updateTag = Atom.family(({ req, name }: TagKey) =>
  viewMutation(tagsFor(req), {
    name: "updateTag",
    predict: (tags, patch: UpdateTagInput) =>
      tags.map((tag) =>
        tag.name === name
          ? {
              ...tag,
              name: patch.name ?? tag.name,
              color: patch.color ?? tag.color
            }
          : tag
      ),
    call: (client, patch) =>
      client.tags.update({
        params: { ...req.params, name },
        payload: patch
      }),
    confirm: (tags, updated, patch) =>
      tags.map((tag) =>
        tag.name === name || tag.name === patch.name ? updated : tag
      ),
    publish: (_updated, patch) =>
      renames(name, patch) ? tagsChanged(scopeOf(req)) : []
  })
)

const withoutTag = (tags: ReadonlyArray<Tag>, name: TagName) =>
  tags.filter((tag) => tag.name !== name)

export const deleteTag = Atom.family(({ req, name }: TagKey) =>
  viewMutation(tagsFor(req), {
    name: "deleteTag",
    predict: (tags, _input: void) => withoutTag(tags, name),
    call: (client) => client.tags.delete({ params: { ...req.params, name } }),
    confirm: (tags) => withoutTag(tags, name),
    publish: () => tagsChanged(scopeOf(req))
  })
)
