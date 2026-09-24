import { Db } from "@pp/db"
import {
  BlockKey,
  blockLookupFor,
  Conflict,
  extractAttachmentRefs,
  extractMentionLinks,
  Forbidden,
  NotFound,
  parseMentionHref,
  parseTicketBlocks,
  resolveLibrary,
  resolveSyncedBlocks,
  serializeTicketBlocks,
  validateTicketBlocks,
  Validation,
  type BlockDefinition,
  type BlockDraft,
  type CreateBlockInput,
  type Layer as LibraryLayer,
  type Library as LibraryValue,
  type LibraryLayers,
  type MentionInvalid,
  type TicketBlockSegment,
  type UpdateBlockInput
} from "@pp/shared"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import * as Semaphore from "effect/Semaphore"

import { validateBodyMentions } from "../comments/BodyMentions"
import type { LibraryKind, MarkdownError } from "../markdown/Markdown"
import {
  CurrentOrg,
  isOrgAdminRole,
  requireOrgAdmin
} from "../organizations/CurrentOrg"
import { Projects } from "../projects/Projects"
import { TicketDocs } from "../tickets/TicketDocs"
import { Library, type LibraryShape } from "./Library"
import { LibraryDocs } from "./LibraryDocs"

type Keyed = Readonly<{ key: string }>

type KindOps<Draft extends Keyed, Definition extends Keyed> = Readonly<{
  kind: LibraryKind
  isKey: (key: string) => boolean
  definitions: (layer: LibraryLayer) => ReadonlyArray<Draft>
  hidden: (layer: LibraryLayer) => ReadonlyArray<string>
  entries: (library: LibraryValue) => ReadonlyArray<Definition>
  withDefinition: (layer: LibraryLayer, draft: Draft) => LibraryLayer
  contentOf: (draft: Draft) => string
  allowsBlocks: boolean
}>

const EDITOR_ROLES = ["owner", "admin"] as const

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

export const LibraryLive = Layer.effect(
  Library,
  Effect.gen(function* () {
    const db = yield* Db
    const docs = yield* LibraryDocs
    const projects = yield* Projects
    const currentOrg = yield* CurrentOrg
    const ticketDocs = yield* TicketDocs
    const layerLocks = new Map<string, Semaphore.Semaphore>()

    const withLayerLock = <A, E, R>(
      orgSlug: string,
      slug: string | null,
      effect: Effect.Effect<A, E, R>
    ): Effect.Effect<A, E, R> => {
      const key = `${orgSlug}/${slug ?? ""}`
      const lock = layerLocks.get(key) ?? Semaphore.makeUnsafe(1)
      layerLocks.set(key, lock)
      return lock.withPermits(1)(effect)
    }

    const layersFor = (
      orgSlug: string,
      slug: string | null
    ): Effect.Effect<LibraryLayers, MarkdownError> =>
      Effect.all(
        {
          org: docs.readLayer(orgSlug, null),
          project:
            slug === null ? Effect.succeed(null) : docs.readLayer(orgSlug, slug)
        },
        { concurrency: 2 }
      )

    const requireEditor = (
      orgSlug: string,
      userId: string,
      slug: string | null
    ): Effect.Effect<void, NotFound | Forbidden> =>
      slug === null
        ? Effect.asVoid(requireOrgAdmin(currentOrg, orgSlug, userId))
        : Effect.asVoid(
            projects.requireRole(orgSlug, userId, slug, EDITOR_ROLES)
          )

    const projectMemberIds = (
      slug: string
    ): Effect.Effect<ReadonlySet<string>> =>
      db.query.projectMember
        .findMany({
          columns: { userId: true },
          where: {
            RAW: (table, operators) => operators.eq(table.projectSlug, slug)
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
          ? Effect.forEach(
              userIds,
              (userId) =>
                currentOrg.resolve(orgSlug, userId).pipe(
                  Effect.as([userId]),
                  Effect.catchTag("NotFound", () => Effect.succeed([]))
                ),
              { concurrency: 8 }
            ).pipe(Effect.map((found) => new Set(found.flat())))
          : projectMemberIds(slug)

    const knownTickets = (
      orgSlug: string,
      slug: string | null,
      needed: boolean
    ): Effect.Effect<ReadonlySet<string>, MarkdownError> =>
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
      const users = yield* knownUsers(orgSlug, slug, userIds)
      const tickets = yield* knownTickets(
        orgSlug,
        slug,
        links.some((link) => link.parsed?.type === "ticket")
      )
      return { users, tickets }
    })

    const validateContent = Effect.fn("Library.validateContent")(function* (
      orgSlug: string,
      slug: string | null,
      content: string,
      allowsBlocks: boolean
    ): Effect.fn.Return<void, Validation | MentionInvalid | MarkdownError> {
      const issue = contentIssue(content, allowsBlocks)
      if (issue !== null) return yield* issue
      if (!content.includes("](mention:")) return
      const { users, tickets } = yield* mentionLookups(orgSlug, slug, content)
      yield* validateBodyMentions(content, users, tickets)
    })

    const sanitizeMentions = Effect.fn("Library.sanitizeMentions")(function* (
      orgSlug: string,
      slug: string,
      body: string
    ): Effect.fn.Return<string, MarkdownError> {
      if (!body.includes("](mention:")) return body
      const { users, tickets } = yield* mentionLookups(orgSlug, slug, body)
      return body.replace(MENTION_LINK, (link, label: string, href: string) => {
        const parsed = parseMentionHref(href)
        const known =
          parsed !== null &&
          label.trim() !== "" &&
          (parsed.type === "user"
            ? users.has(parsed.id)
            : tickets.has(parsed.id))
        return known ? link : plainMention(label, href)
      })
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
      ): Effect.fn.Return<string, MarkdownError> {
        const segments = parseTicketBlocks(body)
        if (!segments.some(isSyncedWithMention)) return body
        const sanitized = yield* Effect.forEach(segments, (segment) =>
          segment.kind === "block" && isSyncedWithMention(segment)
            ? sanitizeMentions(orgSlug, slug, segment.content).pipe(
                Effect.map((content) => ({ ...segment, content }))
              )
            : Effect.succeed(segment)
        )
        return serializeTicketBlocks(sanitized)
      }
    )

    const keyTaken = <Draft extends Keyed>(
      ops: KindOps<Draft, Keyed>,
      orgSlug: string,
      slug: string | null,
      layers: LibraryLayers,
      key: string
    ): Effect.Effect<boolean, MarkdownError> =>
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
      ) => Effect.Effect<void, MarkdownError>,
      orgSlug: string,
      slug: string | null,
      layers: LibraryLayers,
      draft: Draft
    ): Effect.Effect<Definition, Validation | MentionInvalid | MarkdownError> =>
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
      ) => Effect.Effect<void, MarkdownError>,
      orgSlug: string,
      userId: string,
      slug: string | null,
      draft: Draft
    ): Effect.Effect<
      Definition,
      | NotFound
      | Forbidden
      | Conflict
      | Validation
      | MentionInvalid
      | MarkdownError
    > =>
      Effect.gen(function* () {
        yield* requireEditor(orgSlug, userId, slug)
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
      }).pipe(
        Effect.withSpan(`Library.create:${ops.kind}`, {
          attributes: { orgSlug, slug, key: draft.key }
        })
      )

    const updateEntry = <Draft extends Keyed, Definition extends Keyed, Patch>(
      ops: KindOps<Draft, Definition>,
      write: (
        orgSlug: string,
        slug: string | null,
        draft: Draft
      ) => Effect.Effect<void, MarkdownError>,
      patch: (draft: Draft, input: Patch) => Draft,
      orgSlug: string,
      userId: string,
      slug: string | null,
      key: string,
      input: Patch
    ): Effect.Effect<
      Definition,
      NotFound | Forbidden | Validation | MentionInvalid | MarkdownError
    > =>
      Effect.gen(function* () {
        yield* requireEditor(orgSlug, userId, slug)
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
      }).pipe(
        Effect.withSpan(`Library.update:${ops.kind}`, {
          attributes: { orgSlug, slug, key }
        })
      )

    const removeEntry = (
      ops: Pick<KindOps<Keyed, Keyed>, "kind" | "isKey">,
      orgSlug: string,
      userId: string,
      slug: string | null,
      key: string
    ): Effect.Effect<void, NotFound | Forbidden | MarkdownError> =>
      Effect.gen(function* () {
        yield* requireEditor(orgSlug, userId, slug)
        if (!ops.isKey(key)) return yield* new NotFound()
        const removed = yield* withLayerLock(
          orgSlug,
          slug,
          docs.remove(orgSlug, slug, ops.kind, key)
        )
        if (!removed) return yield* new NotFound()
      }).pipe(
        Effect.withSpan(`Library.remove:${ops.kind}`, {
          attributes: { orgSlug, slug, key }
        })
      )

    const hideEntry = <Draft extends Keyed>(
      ops: Pick<
        KindOps<Draft, Keyed>,
        "kind" | "isKey" | "definitions" | "hidden"
      >,
      orgSlug: string,
      userId: string,
      slug: string,
      key: string
    ): Effect.Effect<void, NotFound | Forbidden | Conflict | MarkdownError> =>
      Effect.gen(function* () {
        yield* requireEditor(orgSlug, userId, slug)
        if (!ops.isKey(key)) return yield* new NotFound()
        yield* withLayerLock(
          orgSlug,
          slug,
          Effect.gen(function* () {
            const layers = yield* layersFor(orgSlug, slug)
            const inherited = ops
              .definitions(layers.org)
              .some((definition) => definition.key === key)
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
      }).pipe(
        Effect.withSpan(`Library.hide:${ops.kind}`, {
          attributes: { orgSlug, slug, key }
        })
      )

    const orgLibrary = Effect.fn("Library.orgLibrary")(function* (
      orgSlug: string,
      userId: string
    ): Effect.fn.Return<LibraryValue, NotFound | MarkdownError> {
      const org = yield* currentOrg.resolve(orgSlug, userId)
      const layers = yield* layersFor(orgSlug, null)
      return resolveLibrary(layers, isOrgAdminRole(org.role))
    })

    const projectLibrary = Effect.fn("Library.projectLibrary")(function* (
      orgSlug: string,
      userId: string,
      slug: string
    ): Effect.fn.Return<LibraryValue, NotFound | MarkdownError> {
      const membership = yield* projects.requireMember(orgSlug, userId, slug)
      const layers = yield* layersFor(orgSlug, slug)
      return resolveLibrary(
        layers,
        membership.role === "owner" || membership.role === "admin"
      )
    })

    const createBlock = (
      orgSlug: string,
      userId: string,
      slug: string | null,
      input: CreateBlockInput
    ) => createEntry(blockOps, docs.writeBlock, orgSlug, userId, slug, input)

    const updateBlock = (
      orgSlug: string,
      userId: string,
      slug: string | null,
      key: string,
      input: UpdateBlockInput
    ) =>
      updateEntry(
        blockOps,
        docs.writeBlock,
        patchBlock,
        orgSlug,
        userId,
        slug,
        key,
        input
      )

    const resolveSynced = Effect.fn("Library.resolveSynced")(function* (
      orgSlug: string,
      slug: string,
      body: string
    ): Effect.fn.Return<string, MarkdownError> {
      if (!SYNCED_OPENER.test(body)) return body
      const library = resolveLibrary(yield* layersFor(orgSlug, slug), false)
      return yield* sanitizeSyncedMentions(
        orgSlug,
        slug,
        resolveSyncedBlocks(body, blockLookupFor(library))
      )
    })

    return Library.of({
      orgLibrary,
      projectLibrary,
      createBlock,
      updateBlock,
      removeBlock: (orgSlug, userId, slug, key) =>
        removeEntry(blockOps, orgSlug, userId, slug, key),
      hideBlock: (orgSlug, userId, slug, key) =>
        hideEntry(blockOps, orgSlug, userId, slug, key),
      resolveSynced
    } satisfies LibraryShape)
  })
)
