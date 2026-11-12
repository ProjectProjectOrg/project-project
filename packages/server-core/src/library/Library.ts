import { Db } from "@pp/db"
import {
  type BlockDefinition,
  Conflict,
  type CreateBlockInput,
  type CreateTypeInput,
  type Library as LibraryValue,
  type MentionInvalid,
  NotFound,
  type TagName,
  type TypeDefinition,
  TypeKey,
  type TicketPriority,
  type UpdateBlockInput,
  type UpdateTypeInput,
  Validation,
  OrgScope,
  ProjectScope,
  BASE_LAYER,
  BlockKey,
  blockLookupFor,
  expandType,
  isPristineTypeBody,
  stripHints,
  typeFor,
  extractAttachmentRefs,
  extractMentionLinks,
  parseMentionHref,
  parseTicketBlocks,
  resolveLibrary,
  resolveSyncedBlocks,
  serializeTicketBlocks,
  validateTicketBlocks,
  type BlockDraft,
  type Layer as LibraryLayer,
  type LibraryLayers,
  type TypeDraft,
  type TicketBlockSegment
} from "@pp/shared"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"

import { validateBodyMentions } from "../comments/BodyMentions"
import * as KeyedLock from "../locks/KeyedLock"
import type * as Markdown from "../markdown/Markdown"
import * as TicketDocs from "../tickets/TicketDocs"
import * as LibraryDocs from "./LibraryDocs"

export type TypeExpansion = Readonly<{
  body: string
  priority: TicketPriority | null
  tags: ReadonlyArray<TagName>
}>

type OrgEditError = Validation | MentionInvalid | Markdown.MarkdownError

type ProjectEditError = NotFound | OrgEditError

export class Library extends Context.Service<
  Library,
  Readonly<{
    orgLibrary: () => Effect.Effect<
      LibraryValue,
      NotFound | Markdown.MarkdownError,
      OrgScope
    >
    projectLibrary: () => Effect.Effect<
      LibraryValue,
      NotFound | Markdown.MarkdownError,
      ProjectScope
    >
    createOrgBlock: (
      input: CreateBlockInput
    ) => Effect.Effect<BlockDefinition, OrgEditError | Conflict, OrgScope>
    updateOrgBlock: (
      key: string,
      input: UpdateBlockInput
    ) => Effect.Effect<BlockDefinition, OrgEditError | NotFound, OrgScope>
    removeOrgBlock: (
      key: string
    ) => Effect.Effect<void, NotFound | Markdown.MarkdownError, OrgScope>
    createOrgType: (
      input: CreateTypeInput
    ) => Effect.Effect<TypeDefinition, OrgEditError | Conflict, OrgScope>
    updateOrgType: (
      key: string,
      input: UpdateTypeInput
    ) => Effect.Effect<TypeDefinition, OrgEditError | NotFound, OrgScope>
    removeOrgType: (
      key: string
    ) => Effect.Effect<void, NotFound | Markdown.MarkdownError, OrgScope>
    createBlock: (
      input: CreateBlockInput
    ) => Effect.Effect<
      BlockDefinition,
      ProjectEditError | Conflict,
      ProjectScope
    >
    updateBlock: (
      key: string,
      input: UpdateBlockInput
    ) => Effect.Effect<BlockDefinition, ProjectEditError, ProjectScope>
    removeBlock: (
      key: string
    ) => Effect.Effect<void, NotFound | Markdown.MarkdownError, ProjectScope>
    hideBlock: (
      key: string
    ) => Effect.Effect<
      void,
      NotFound | Conflict | Markdown.MarkdownError,
      ProjectScope
    >
    createType: (
      input: CreateTypeInput
    ) => Effect.Effect<
      TypeDefinition,
      ProjectEditError | Conflict,
      ProjectScope
    >
    updateType: (
      key: string,
      input: UpdateTypeInput
    ) => Effect.Effect<TypeDefinition, ProjectEditError, ProjectScope>
    removeType: (
      key: string
    ) => Effect.Effect<void, NotFound | Markdown.MarkdownError, ProjectScope>
    hideType: (
      key: string
    ) => Effect.Effect<
      void,
      NotFound | Conflict | Markdown.MarkdownError,
      ProjectScope
    >
    expandForCreate: (
      orgSlug: string,
      slug: string,
      key: TypeKey
    ) => Effect.Effect<
      TypeExpansion,
      NotFound | Validation | Markdown.MarkdownError
    >
    typeKeys: (
      orgSlug: string,
      slug: string
    ) => Effect.Effect<ReadonlySet<string>, Markdown.MarkdownError>
    untouchedBodyCheck: (
      orgSlug: string,
      slug: string
    ) => Effect.Effect<(body: string) => boolean, Markdown.MarkdownError>
    resolveSynced: (
      orgSlug: string,
      slug: string,
      body: string
    ) => Effect.Effect<string, Markdown.MarkdownError>
  }>
>()("@pp/server-core/library/Library") {}

type Keyed = Readonly<{ key: string }>

type KindOps<Draft extends Keyed, Definition extends Keyed> = Readonly<{
  kind: Markdown.LibraryKind
  isKey: (key: string) => boolean
  definitions: (layer: LibraryLayer) => ReadonlyArray<Draft>
  hidden: (layer: LibraryLayer) => ReadonlyArray<string>
  entries: (library: LibraryValue) => ReadonlyArray<Definition>
  withDefinition: (layer: LibraryLayer, draft: Draft) => LibraryLayer
  contentOf: (draft: Draft) => string
  allowsBlocks: boolean
}>

const SYNCED_OPENER = /<block[^>\n]*\ssync/

const BLOCK_TAG = /<\/?block\b/

const MENTION_LINK = /\[([^\]]*)\]\((mention:[^)]+)\)/g

const replaceByKey = <A extends Keyed>(
  items: ReadonlyArray<A>,
  next: A
): ReadonlyArray<A> => [...items.filter((item) => item.key !== next.key), next]

const blockOps: KindOps<BlockDraft, BlockDefinition> = {
  kind: "blocks",
  isKey: Schema.is(BlockKey),
  definitions: (layer) => layer.blocks,
  hidden: (layer) => layer.hiddenBlocks,
  entries: (library) => library.blocks,
  withDefinition: (layer, draft) => ({
    ...layer,
    blocks: replaceByKey(layer.blocks, draft),
    hiddenBlocks: layer.hiddenBlocks.filter((key) => key !== draft.key)
  }),
  contentOf: (draft) => draft.content,
  allowsBlocks: false
}

const typeOps: KindOps<TypeDraft, TypeDefinition> = {
  kind: "types",
  isKey: Schema.is(TypeKey),
  definitions: (layer) => layer.types,
  hidden: (layer) => layer.hiddenTypes,
  entries: (library) => library.types,
  withDefinition: (layer, draft) => ({
    ...layer,
    types: replaceByKey(layer.types, draft),
    hiddenTypes: layer.hiddenTypes.filter((key) => key !== draft.key)
  }),
  contentOf: (draft) => draft.body,
  allowsBlocks: true
}

const patched = <A>(next: A | undefined, current: A): A =>
  next === undefined ? current : next

const patchBlock = (
  draft: BlockDraft,
  patch: UpdateBlockInput
): BlockDraft => ({
  key: draft.key,
  name: patched(patch.name, draft.name),
  icon: patched(patch.icon, draft.icon),
  color: patched(patch.color, draft.color),
  description: patched(patch.description, draft.description),
  sync: patched(patch.sync, draft.sync),
  content: patched(patch.content, draft.content)
})

const patchType = (draft: TypeDraft, patch: UpdateTypeInput): TypeDraft => ({
  key: draft.key,
  name: patched(patch.name, draft.name),
  icon: patched(patch.icon, draft.icon),
  color: patched(patch.color, draft.color),
  description: patched(patch.description, draft.description),
  priority: patched(patch.priority, draft.priority),
  tags: patched(patch.tags, draft.tags),
  body: patched(patch.body, draft.body)
})

const hasFileAt = <Draft extends Keyed>(
  ops: KindOps<Draft, Keyed>,
  layer: LibraryLayer,
  key: string
): boolean =>
  ops.hidden(layer).includes(key) ||
  ops.definitions(layer).some((definition) => definition.key === key)

const ownLayer = (layers: LibraryLayers): LibraryLayer =>
  layers.project ?? layers.org

const withOwnLayer = (
  layers: LibraryLayers,
  layer: LibraryLayer
): LibraryLayers =>
  layers.project === null
    ? { ...layers, org: layer }
    : { ...layers, project: layer }

const contentIssue = (
  content: string,
  allowsBlocks: boolean
): Validation | null => {
  if (extractAttachmentRefs(content).length > 0)
    return new Validation({ reason: "attachments_not_allowed" })
  if (!allowsBlocks && BLOCK_TAG.test(content))
    return new Validation({ reason: "blocks_not_allowed" })
  const [issue] = validateTicketBlocks(content)
  return issue === undefined
    ? null
    : new Validation({ reason: `invalid_blocks:${issue.code}:${issue.line}` })
}

const plainMention = (label: string, href: string): string => {
  const parsed = parseMentionHref(href)
  if (parsed?.type === "ticket") return parsed.id
  const name = label.trim().replace(/^@/, "")
  if (parsed?.type === "user") return name === "" ? "" : `@${name}`
  return label
}

type LayerTarget = Readonly<{ orgSlug: string; slug: string | null }>

const make = Effect.gen(function* () {
  const db = yield* Db
  const docs = yield* LibraryDocs.LibraryDocs
  const ticketDocs = yield* TicketDocs.TicketDocs
  const keyedLock = yield* KeyedLock.KeyedLock

  const withLayerLock = <A, E, R>(
    orgSlug: string,
    slug: string | null,
    effect: Effect.Effect<A, E, R>
  ): Effect.Effect<A, E, R> =>
    keyedLock.withLock(KeyedLock.LockKey.libraryLayer(orgSlug, slug), effect)

  const orgLayer: Effect.Effect<LayerTarget, never, OrgScope> = Effect.map(
    OrgScope,
    ({ orgSlug }) => ({ orgSlug, slug: null })
  )

  const projectLayer: Effect.Effect<
    Readonly<{ orgSlug: string; slug: string }>,
    never,
    ProjectScope
  > = Effect.map(ProjectScope, ({ orgSlug, slug }) => ({ orgSlug, slug }))

  const layersFor = (
    orgSlug: string,
    slug: string | null
  ): Effect.Effect<LibraryLayers, Markdown.MarkdownError> =>
    Effect.all(
      {
        org: docs.readLayer(orgSlug, null),
        project:
          slug === null ? Effect.succeed(null) : docs.readLayer(orgSlug, slug)
      },
      { concurrency: 2 }
    )

  const projectMemberIds = (
    orgSlug: string,
    slug: string
  ): Effect.Effect<ReadonlySet<string>> =>
    db.query.projectMember
      .findMany({
        columns: { userId: true },
        where: { project: { slug, organization: { slug: orgSlug } } }
      })
      .pipe(
        Effect.map((rows) => new Set<string>(rows.map((row) => row.userId))),
        Effect.orDie
      )

  const orgMemberIds = (
    orgSlug: string,
    userIds: ReadonlyArray<string>
  ): Effect.Effect<ReadonlySet<string>> =>
    db.query.member
      .findMany({
        columns: { userId: true },
        where: {
          userId: { in: [...userIds] },
          organization: { slug: orgSlug }
        }
      })
      .pipe(
        Effect.map((rows) => new Set<string>(rows.map((row) => row.userId))),
        Effect.orDie
      )

  const knownUsers = (
    orgSlug: string,
    slug: string | null,
    userIds: ReadonlyArray<string>
  ): Effect.Effect<ReadonlySet<string>> =>
    userIds.length === 0
      ? Effect.succeed(new Set<string>())
      : slug === null
        ? orgMemberIds(orgSlug, userIds)
        : projectMemberIds(orgSlug, slug)

  const knownTickets = (
    orgSlug: string,
    slug: string | null,
    needed: boolean
  ): Effect.Effect<ReadonlySet<string>, Markdown.MarkdownError> =>
    slug === null || !needed
      ? Effect.succeed(new Set<string>())
      : ticketDocs
          .listIds(orgSlug, slug)
          .pipe(Effect.map((ids) => new Set<string>(ids)))

  const mentionLookups = Effect.fn("Library.mentionLookups")(function* (
    orgSlug: string,
    slug: string | null,
    content: string
  ) {
    const links = extractMentionLinks(content)
    const userIds = [
      ...new Set(
        links.flatMap((link) =>
          link.parsed?.type === "user" ? [link.parsed.id] : []
        )
      )
    ]
    const [users, tickets] = yield* Effect.all(
      [
        knownUsers(orgSlug, slug, userIds),
        knownTickets(
          orgSlug,
          slug,
          links.some((link) => link.parsed?.type === "ticket")
        )
      ],
      { concurrency: 2 }
    )
    return { users, tickets }
  })

  const validateContent = Effect.fn("Library.validateContent")(function* (
    orgSlug: string,
    slug: string | null,
    content: string,
    allowsBlocks: boolean
  ): Effect.fn.Return<
    void,
    Validation | MentionInvalid | Markdown.MarkdownError
  > {
    const issue = contentIssue(content, allowsBlocks)
    if (issue !== null) return yield* issue
    if (!content.includes("](mention:")) return
    const { users, tickets } = yield* mentionLookups(orgSlug, slug, content)
    yield* validateBodyMentions(content, users, tickets)
  })

  const withKnownMentions = (
    body: string,
    {
      users,
      tickets
    }: Readonly<{ users: ReadonlySet<string>; tickets: ReadonlySet<string> }>
  ): string =>
    body.replace(MENTION_LINK, (link, label: string, href: string) => {
      const parsed = parseMentionHref(href)
      const known =
        parsed !== null &&
        label.trim() !== "" &&
        (parsed.type === "user" ? users.has(parsed.id) : tickets.has(parsed.id))
      return known ? link : plainMention(label, href)
    })

  const sanitizeMentions = Effect.fn("Library.sanitizeMentions")(function* (
    orgSlug: string,
    slug: string,
    body: string
  ): Effect.fn.Return<string, Markdown.MarkdownError> {
    if (!body.includes("](mention:")) return body
    return withKnownMentions(body, yield* mentionLookups(orgSlug, slug, body))
  })

  const isSyncedWithMention = (segment: TicketBlockSegment): boolean =>
    segment.kind === "block" &&
    segment.sync === true &&
    segment.content.includes("](mention:")

  const sanitizeSyncedMentions = Effect.fn("Library.sanitizeSyncedMentions")(
    function* (
      orgSlug: string,
      slug: string,
      body: string
    ): Effect.fn.Return<string, Markdown.MarkdownError> {
      const segments = parseTicketBlocks(body)
      const synced = segments.filter(isSyncedWithMention)
      if (synced.length === 0) return body
      const lookups = yield* mentionLookups(
        orgSlug,
        slug,
        synced
          .map((segment) => (segment.kind === "block" ? segment.content : ""))
          .join("\n")
      )
      return serializeTicketBlocks(
        segments.map((segment) =>
          segment.kind === "block" && isSyncedWithMention(segment)
            ? {
                ...segment,
                content: withKnownMentions(segment.content, lookups)
              }
            : segment
        )
      )
    }
  )

  const projectTagNames = Effect.fn("Library.projectTagNames")(function* (
    orgSlug: string,
    slug: string
  ) {
    const rows = yield* db.query.projectTag.findMany({
      columns: { name: true },
      where: { project: { slug, organization: { slug: orgSlug } } }
    })
    return new Set<string>(rows.map((row) => row.name))
  }, Effect.orDie)

  const keyTaken = <Draft extends Keyed>(
    ops: KindOps<Draft, Keyed>,
    orgSlug: string,
    slug: string | null,
    layers: LibraryLayers,
    key: string
  ): Effect.Effect<boolean, Markdown.MarkdownError> =>
    hasFileAt(ops, ownLayer(layers), key)
      ? Effect.succeed(true)
      : docs.hasFile(orgSlug, slug, ops.kind, key)

  const resolvedEntry = <Draft extends Keyed, Definition extends Keyed>(
    ops: KindOps<Draft, Definition>,
    layers: LibraryLayers,
    key: string
  ): Effect.Effect<Definition> => {
    const entry = ops
      .entries(resolveLibrary(layers, true))
      .find((definition) => definition.key === key)
    return entry === undefined
      ? Effect.die(
          new Error(`library entry ${key} did not resolve after write`)
        )
      : Effect.succeed(entry)
  }

  const saveDraft = <Draft extends Keyed, Definition extends Keyed>(
    ops: KindOps<Draft, Definition>,
    write: (
      orgSlug: string,
      slug: string | null,
      draft: Draft
    ) => Effect.Effect<void, Markdown.MarkdownError>,
    orgSlug: string,
    slug: string | null,
    layers: LibraryLayers,
    draft: Draft
  ): Effect.Effect<
    Definition,
    Validation | MentionInvalid | Markdown.MarkdownError
  > =>
    Effect.gen(function* () {
      yield* validateContent(
        orgSlug,
        slug,
        ops.contentOf(draft),
        ops.allowsBlocks
      )
      yield* write(orgSlug, slug, draft)
      return yield* resolvedEntry(
        ops,
        withOwnLayer(layers, ops.withDefinition(ownLayer(layers), draft)),
        draft.key
      )
    })

  const createEntry = <Draft extends Keyed, Definition extends Keyed>(
    ops: KindOps<Draft, Definition>,
    write: (
      orgSlug: string,
      slug: string | null,
      draft: Draft
    ) => Effect.Effect<void, Markdown.MarkdownError>,
    orgSlug: string,
    slug: string | null,
    draft: Draft
  ): Effect.Effect<
    Definition,
    Conflict | Validation | MentionInvalid | Markdown.MarkdownError
  > =>
    Effect.gen(function* () {
      yield* Effect.annotateCurrentSpan({ orgSlug, slug, key: draft.key })
      return yield* withLayerLock(
        orgSlug,
        slug,
        Effect.gen(function* () {
          const layers = yield* layersFor(orgSlug, slug)
          if (yield* keyTaken(ops, orgSlug, slug, layers, draft.key))
            return yield* new Conflict({ reason: "key_taken" })
          return yield* saveDraft(ops, write, orgSlug, slug, layers, draft)
        })
      )
    })

  const updateEntry = <Draft extends Keyed, Definition extends Keyed, Patch>(
    ops: KindOps<Draft, Definition>,
    write: (
      orgSlug: string,
      slug: string | null,
      draft: Draft
    ) => Effect.Effect<void, Markdown.MarkdownError>,
    patch: (draft: Draft, input: Patch) => Draft,
    orgSlug: string,
    slug: string | null,
    key: string,
    input: Patch
  ): Effect.Effect<
    Definition,
    NotFound | Validation | MentionInvalid | Markdown.MarkdownError
  > =>
    Effect.gen(function* () {
      yield* Effect.annotateCurrentSpan({ orgSlug, slug, key })
      if (!ops.isKey(key)) return yield* new NotFound()
      return yield* withLayerLock(
        orgSlug,
        slug,
        Effect.gen(function* () {
          const layers = yield* layersFor(orgSlug, slug)
          const existing = ops
            .definitions(ownLayer(layers))
            .find((definition) => definition.key === key)
          if (existing === undefined) return yield* new NotFound()
          return yield* saveDraft(
            ops,
            write,
            orgSlug,
            slug,
            layers,
            patch(existing, input)
          )
        })
      )
    })

  const removeEntry = (
    ops: Pick<KindOps<Keyed, Keyed>, "kind" | "isKey">,
    orgSlug: string,
    slug: string | null,
    key: string
  ): Effect.Effect<void, NotFound | Markdown.MarkdownError> =>
    Effect.gen(function* () {
      yield* Effect.annotateCurrentSpan({ orgSlug, slug, key })
      if (!ops.isKey(key)) return yield* new NotFound()
      const removed = yield* withLayerLock(
        orgSlug,
        slug,
        docs.remove(orgSlug, slug, ops.kind, key)
      )
      if (!removed) return yield* new NotFound()
    })

  const hideEntry = <Draft extends Keyed>(
    ops: Pick<
      KindOps<Draft, Keyed>,
      "kind" | "isKey" | "definitions" | "hidden"
    >,
    orgSlug: string,
    slug: string,
    key: string
  ): Effect.Effect<void, NotFound | Conflict | Markdown.MarkdownError> =>
    Effect.gen(function* () {
      yield* Effect.annotateCurrentSpan({ orgSlug, slug, key })
      if (!ops.isKey(key)) return yield* new NotFound()
      yield* withLayerLock(
        orgSlug,
        slug,
        Effect.gen(function* () {
          const layers = yield* layersFor(orgSlug, slug)
          const inherited = [layers.org, BASE_LAYER].some((layer) =>
            ops.definitions(layer).some((definition) => definition.key === key)
          )
          if (!inherited) return yield* new NotFound()
          const customized = ops
            .definitions(ownLayer(layers))
            .some((definition) => definition.key === key)
          if (customized) return yield* new Conflict({ reason: "customized" })
          const unreadable =
            !ops.hidden(ownLayer(layers)).includes(key) &&
            (yield* docs.hasFile(orgSlug, slug, ops.kind, key))
          if (unreadable) return yield* new Conflict({ reason: "customized" })
          yield* docs.writeTombstone(orgSlug, slug, ops.kind, key)
        })
      )
    })

  const orgLibrary = Effect.fn("Library.orgLibrary")(function* () {
    const { orgSlug, permissions } = yield* OrgScope
    return resolveLibrary(
      yield* layersFor(orgSlug, null),
      permissions.can({ library: ["manage"] })
    )
  })

  const projectLibrary = Effect.fn("Library.projectLibrary")(function* () {
    const { orgSlug, slug, permissions } = yield* ProjectScope
    return resolveLibrary(
      yield* layersFor(orgSlug, slug),
      permissions.can({ library: ["manage"] })
    )
  })

  const expandForCreate = Effect.fn("Library.expandForCreate")(function* (
    orgSlug: string,
    slug: string,
    key: TypeKey
  ): Effect.fn.Return<
    TypeExpansion,
    NotFound | Validation | Markdown.MarkdownError
  > {
    const library = resolveLibrary(yield* layersFor(orgSlug, slug), false)
    const definition = typeFor(library, key)
    if (definition === null)
      return yield* new Validation({ reason: `unknown_type:${key}` })
    const [body, known] = yield* Effect.all(
      [
        sanitizeMentions(
          orgSlug,
          slug,
          expandType(definition, blockLookupFor(library))
        ),
        definition.tags.length === 0
          ? Effect.succeed(new Set<string>())
          : projectTagNames(orgSlug, slug)
      ],
      { concurrency: 2 }
    )
    return {
      body,
      priority: definition.priority,
      tags: definition.tags.filter((tag) => known.has(tag))
    }
  })

  const typeKeys = Effect.fn("Library.typeKeys")(function* (
    orgSlug: string,
    slug: string
  ): Effect.fn.Return<ReadonlySet<string>, Markdown.MarkdownError> {
    const library = resolveLibrary(yield* layersFor(orgSlug, slug), false)
    return new Set(
      library.types.flatMap((type) => (type.hidden ? [] : [type.key]))
    )
  })

  const untouchedBodyCheck = Effect.fn("Library.untouchedBodyCheck")(function* (
    orgSlug: string,
    slug: string
  ): Effect.fn.Return<(body: string) => boolean, Markdown.MarkdownError> {
    const library = resolveLibrary(yield* layersFor(orgSlug, slug), false)
    const lookup = blockLookupFor(library)
    return (body) => {
      if (body.trim() === "") return true
      const comparable = stripHints(body)
      return library.types.some((type) =>
        isPristineTypeBody(comparable, type, lookup)
      )
    }
  })

  const resolveSynced = Effect.fn("Library.resolveSynced")(function* (
    orgSlug: string,
    slug: string,
    body: string
  ): Effect.fn.Return<string, Markdown.MarkdownError> {
    if (!SYNCED_OPENER.test(body)) return body
    const library = resolveLibrary(yield* layersFor(orgSlug, slug), false)
    return yield* sanitizeSyncedMentions(
      orgSlug,
      slug,
      resolveSyncedBlocks(body, blockLookupFor(library))
    )
  })

  const createBlockIn = <E, R>(
    layer: Effect.Effect<LayerTarget, E, R>,
    input: CreateBlockInput
  ) =>
    Effect.flatMap(layer, ({ orgSlug, slug }) =>
      createEntry(blockOps, docs.writeBlock, orgSlug, slug, input)
    )

  const updateBlockIn = <E, R>(
    layer: Effect.Effect<LayerTarget, E, R>,
    key: string,
    input: UpdateBlockInput
  ) =>
    Effect.flatMap(layer, ({ orgSlug, slug }) =>
      updateEntry(
        blockOps,
        docs.writeBlock,
        patchBlock,
        orgSlug,
        slug,
        key,
        input
      )
    )

  const createTypeIn = <E, R>(
    layer: Effect.Effect<LayerTarget, E, R>,
    input: CreateTypeInput
  ) =>
    Effect.flatMap(layer, ({ orgSlug, slug }) =>
      createEntry(typeOps, docs.writeType, orgSlug, slug, input)
    )

  const updateTypeIn = <E, R>(
    layer: Effect.Effect<LayerTarget, E, R>,
    key: string,
    input: UpdateTypeInput
  ) =>
    Effect.flatMap(layer, ({ orgSlug, slug }) =>
      updateEntry(typeOps, docs.writeType, patchType, orgSlug, slug, key, input)
    )

  const removeFrom = <E, R>(
    layer: Effect.Effect<LayerTarget, E, R>,
    ops: Pick<KindOps<Keyed, Keyed>, "kind" | "isKey">,
    key: string
  ) =>
    Effect.flatMap(layer, ({ orgSlug, slug }) =>
      removeEntry(ops, orgSlug, slug, key)
    )

  const hideIn = <Draft extends Keyed>(
    ops: Pick<
      KindOps<Draft, Keyed>,
      "kind" | "isKey" | "definitions" | "hidden"
    >,
    key: string
  ) =>
    Effect.flatMap(projectLayer, ({ orgSlug, slug }) =>
      hideEntry(ops, orgSlug, slug, key)
    )

  const createOrgBlock = Effect.fn("Library.createOrgBlock")(function* (
    input: CreateBlockInput
  ) {
    return yield* createBlockIn(orgLayer, input)
  })

  const updateOrgBlock = Effect.fn("Library.updateOrgBlock")(function* (
    key: string,
    input: UpdateBlockInput
  ) {
    return yield* updateBlockIn(orgLayer, key, input)
  })

  const removeOrgBlock = Effect.fn("Library.removeOrgBlock")(function* (
    key: string
  ) {
    return yield* removeFrom(orgLayer, blockOps, key)
  })

  const createOrgType = Effect.fn("Library.createOrgType")(function* (
    input: CreateTypeInput
  ) {
    return yield* createTypeIn(orgLayer, input)
  })

  const updateOrgType = Effect.fn("Library.updateOrgType")(function* (
    key: string,
    input: UpdateTypeInput
  ) {
    return yield* updateTypeIn(orgLayer, key, input)
  })

  const removeOrgType = Effect.fn("Library.removeOrgType")(function* (
    key: string
  ) {
    return yield* removeFrom(orgLayer, typeOps, key)
  })

  const createBlock = Effect.fn("Library.createBlock")(function* (
    input: CreateBlockInput
  ) {
    return yield* createBlockIn(projectLayer, input)
  })

  const updateBlock = Effect.fn("Library.updateBlock")(function* (
    key: string,
    input: UpdateBlockInput
  ) {
    return yield* updateBlockIn(projectLayer, key, input)
  })

  const removeBlock = Effect.fn("Library.removeBlock")(function* (key: string) {
    return yield* removeFrom(projectLayer, blockOps, key)
  })

  const hideBlock = Effect.fn("Library.hideBlock")(function* (key: string) {
    return yield* hideIn(blockOps, key)
  })

  const createType = Effect.fn("Library.createType")(function* (
    input: CreateTypeInput
  ) {
    return yield* createTypeIn(projectLayer, input)
  })

  const updateType = Effect.fn("Library.updateType")(function* (
    key: string,
    input: UpdateTypeInput
  ) {
    return yield* updateTypeIn(projectLayer, key, input)
  })

  const removeType = Effect.fn("Library.removeType")(function* (key: string) {
    return yield* removeFrom(projectLayer, typeOps, key)
  })

  const hideType = Effect.fn("Library.hideType")(function* (key: string) {
    return yield* hideIn(typeOps, key)
  })

  return Library.of({
    orgLibrary,
    projectLibrary,
    createOrgBlock,
    updateOrgBlock,
    removeOrgBlock,
    createOrgType,
    updateOrgType,
    removeOrgType,
    createBlock,
    updateBlock,
    removeBlock,
    hideBlock,
    createType,
    updateType,
    removeType,
    hideType,
    expandForCreate,
    typeKeys,
    untouchedBodyCheck,
    resolveSynced
  })
})

export const layer = Layer.effect(Library, make)
