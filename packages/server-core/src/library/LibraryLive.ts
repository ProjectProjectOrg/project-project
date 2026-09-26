import { Db } from "@pp/db"
import {
  BlockKey,
  blockLookupFor,
  Conflict,
  expandTemplate,
  extractAttachmentRefs,
  extractMentionLinks,
  Forbidden,
  NotFound,
  parseMentionHref,
  parseTicketBlocks,
  resolveLibrary,
  resolveLibraryDefaults,
  ticketTypeForTemplate,
  resolveSyncedBlocks,
  serializeTicketBlocks,
  TemplateKey,
  validateTicketBlocks,
  Validation,
  withDefaultsUpdate,
  type BlockDefinition,
  type BlockDraft,
  type CreateBlockInput,
  type CreateTemplateInput,
  type Layer as LibraryLayer,
  type LayerDefaults,
  type Library as LibraryValue,
  type LibraryDefaults,
  type LibraryLayers,
  type MentionInvalid,
  type PartialTemplateDefaults,
  type TemplateDefinition,
  type TemplateDraft,
  type TicketBlockSegment,
  type UpdateBlockInput,
  type UpdateTemplateDefaultsInput,
  type UpdateTemplateInput
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
import { ProjectDocs } from "../projects/ProjectDocs"
import { Projects } from "../projects/Projects"
import { TicketDocs } from "../tickets/TicketDocs"
import { Library, type LibraryShape, type TemplateExpansion } from "./Library"
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

const EDITOR_ROLES = ["pm"] as const

const NO_LAYER_DEFAULTS: LayerDefaults = { org: {}, project: null }

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

const templateOps: KindOps<TemplateDraft, TemplateDefinition> = {
  kind: "templates",
  isKey: Schema.is(TemplateKey),
  definitions: (layer) => layer.templates,
  hidden: (layer) => layer.hiddenTemplates,
  entries: (library) => library.templates,
  withDefinition: (layer, draft) => ({
    ...layer,
    templates: replaceByKey(layer.templates, draft),
    hiddenTemplates: layer.hiddenTemplates.filter((key) => key !== draft.key)
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

const patchTemplate = (
  draft: TemplateDraft,
  patch: UpdateTemplateInput
): TemplateDraft => ({
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

export const LibraryLive = Layer.effect(
  Library,
  Effect.gen(function* () {
    const db = yield* Db
    const docs = yield* LibraryDocs
    const projectDocs = yield* ProjectDocs
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
          : projectMemberIds(orgSlug, slug)

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

    const projectTagNames = Effect.fn("Library.projectTagNames")(function* (
      orgSlug: string,
      slug: string
    ) {
      const project = yield* db.query.projectIndex.findFirst({
        columns: { id: true },
        where: { slug, organization: { slug: orgSlug } }
      })
      if (!project) return new Set<string>()
      const rows = yield* db.query.projectTag.findMany({
        columns: { name: true },
        where: {
          RAW: (table, operators) => operators.eq(table.projectId, project.id)
        }
      })
      return new Set<string>(rows.map((row) => row.name))
    }, Effect.orDie)

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
        .entries(resolveLibrary(layers, NO_LAYER_DEFAULTS, true))
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

    const layerDefaultsFor = (
      orgSlug: string,
      slug: string | null
    ): Effect.Effect<LayerDefaults, NotFound | MarkdownError> =>
      Effect.all(
        {
          org: docs.readOrgDefaults(orgSlug),
          project:
            slug === null
              ? Effect.succeed(null)
              : projectDocs
                  .read(orgSlug, slug)
                  .pipe(Effect.map((project) => project.templateDefaults))
        },
        { concurrency: 2 }
      )

    const orgLibrary = Effect.fn("Library.orgLibrary")(function* (
      orgSlug: string,
      userId: string
    ): Effect.fn.Return<LibraryValue, NotFound | MarkdownError> {
      const org = yield* currentOrg.resolve(orgSlug, userId)
      const [layers, defaults] = yield* Effect.all(
        [layersFor(orgSlug, null), layerDefaultsFor(orgSlug, null)],
        { concurrency: 2 }
      )
      return resolveLibrary(layers, defaults, isOrgAdminRole(org.role))
    })

    const projectLibrary = Effect.fn("Library.projectLibrary")(function* (
      orgSlug: string,
      userId: string,
      slug: string
    ): Effect.fn.Return<LibraryValue, NotFound | MarkdownError> {
      const membership = yield* projects.requireMember(orgSlug, userId, slug)
      const [layers, defaults] = yield* Effect.all(
        [layersFor(orgSlug, slug), layerDefaultsFor(orgSlug, slug)],
        { concurrency: 2 }
      )
      return resolveLibrary(layers, defaults, membership.role === "pm")
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

    const createTemplate = (
      orgSlug: string,
      userId: string,
      slug: string | null,
      input: CreateTemplateInput
    ) =>
      createEntry(templateOps, docs.writeTemplate, orgSlug, userId, slug, input)

    const updateTemplate = (
      orgSlug: string,
      userId: string,
      slug: string | null,
      key: string,
      input: UpdateTemplateInput
    ) =>
      updateEntry(
        templateOps,
        docs.writeTemplate,
        patchTemplate,
        orgSlug,
        userId,
        slug,
        key,
        input
      )

    const updateDefaults = Effect.fn("Library.updateDefaults")(function* (
      orgSlug: string,
      slug: string | null,
      input: UpdateTemplateDefaultsInput,
      write: (
        defaults: PartialTemplateDefaults
      ) => Effect.Effect<void, NotFound | MarkdownError>
    ): Effect.fn.Return<
      LibraryDefaults,
      NotFound | Validation | MarkdownError
    > {
      const [layers, current] = yield* Effect.all(
        [layersFor(orgSlug, slug), layerDefaultsFor(orgSlug, slug)],
        { concurrency: 2 }
      )
      const { templates } = resolveLibrary(layers, NO_LAYER_DEFAULTS, true)
      const active = new Set<string>(
        templates.flatMap((template) => (template.hidden ? [] : [template.key]))
      )
      const unknown = Object.values(input.defaults).find(
        (key) => key !== null && key !== undefined && !active.has(key)
      )
      if (unknown !== undefined && unknown !== null)
        return yield* new Validation({
          reason: `unknown_template:${unknown}`
        })
      const own = withDefaultsUpdate(current.project ?? current.org, input)
      yield* write(own)
      return resolveLibraryDefaults(
        slug === null
          ? { org: own, project: null }
          : { org: current.org, project: own },
        templates
      )
    })

    const setOrgTemplateDefaults = Effect.fn("Library.setOrgTemplateDefaults")(
      function* (
        orgSlug: string,
        userId: string,
        input: UpdateTemplateDefaultsInput
      ): Effect.fn.Return<
        LibraryDefaults,
        NotFound | Forbidden | Validation | MarkdownError
      > {
        yield* requireOrgAdmin(currentOrg, orgSlug, userId)
        return yield* withLayerLock(
          orgSlug,
          null,
          updateDefaults(orgSlug, null, input, (defaults) =>
            docs.writeOrgDefaults(orgSlug, defaults)
          )
        )
      }
    )

    const setTemplateDefaults = Effect.fn("Library.setTemplateDefaults")(
      function* (
        orgSlug: string,
        userId: string,
        slug: string,
        input: UpdateTemplateDefaultsInput
      ): Effect.fn.Return<
        LibraryDefaults,
        NotFound | Forbidden | Validation | MarkdownError
      > {
        yield* projects.requireRole(orgSlug, userId, slug, EDITOR_ROLES)
        return yield* withLayerLock(
          orgSlug,
          slug,
          updateDefaults(orgSlug, slug, input, (defaults) =>
            projectDocs.writeTemplateDefaults(orgSlug, slug, defaults)
          )
        )
      }
    )

    const expandForCreate = Effect.fn("Library.expandForCreate")(function* (
      orgSlug: string,
      slug: string,
      key: TemplateKey
    ): Effect.fn.Return<
      TemplateExpansion,
      NotFound | Validation | MarkdownError
    > {
      const [layers, defaults] = yield* Effect.all(
        [layersFor(orgSlug, slug), layerDefaultsFor(orgSlug, slug)],
        { concurrency: 2 }
      )
      const library = resolveLibrary(layers, defaults, false)
      const template = library.templates.find(
        (candidate) => candidate.key === key && !candidate.hidden
      )
      if (template === undefined)
        return yield* new Validation({ reason: `unknown_template:${key}` })
      const body = yield* sanitizeMentions(
        orgSlug,
        slug,
        expandTemplate(template, blockLookupFor(library))
      )
      const known =
        template.tags.length === 0
          ? new Set<string>()
          : yield* projectTagNames(orgSlug, slug)
      return {
        body,
        type: ticketTypeForTemplate(library.defaults, template.key),
        priority: template.priority,
        tags: template.tags.filter((tag) => known.has(tag))
      }
    })

    const resolveSynced = Effect.fn("Library.resolveSynced")(function* (
      orgSlug: string,
      slug: string,
      body: string
    ): Effect.fn.Return<string, MarkdownError> {
      if (!SYNCED_OPENER.test(body)) return body
      const library = resolveLibrary(
        yield* layersFor(orgSlug, slug),
        NO_LAYER_DEFAULTS,
        false
      )
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
      createTemplate,
      updateTemplate,
      removeTemplate: (orgSlug, userId, slug, key) =>
        removeEntry(templateOps, orgSlug, userId, slug, key),
      hideTemplate: (orgSlug, userId, slug, key) =>
        hideEntry(templateOps, orgSlug, userId, slug, key),
      setOrgTemplateDefaults,
      setTemplateDefaults,
      expandForCreate,
      resolveSynced
    } satisfies LibraryShape)
  })
)
