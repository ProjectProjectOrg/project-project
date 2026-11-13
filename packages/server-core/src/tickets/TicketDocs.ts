import {
  ActivityActor,
  activityActorUserId,
  Estimate,
  estimateToken,
  parseEstimateToken,
  type ActivityCause,
  type TicketActivityChange,
  PullRequestState,
  TagName,
  TicketId,
  TicketPriority,
  TicketRank,
  TicketBranchEntry,
  TicketFlag,
  TicketStatus,
  StoredTicketType,
  type NotFound
} from "@pp/shared"
import * as Context from "effect/Context"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import * as SchemaTransformation from "effect/SchemaTransformation"
import * as Struct from "effect/Struct"

import { relationChanges, ticketChanges } from "../activity/changes"
import { ticketCreatedEvents, ticketEvents } from "../activity/projectEvents"
import * as TicketActivity from "../activity/TicketActivity"
import { inboxNotices } from "../inbox/events"
import * as KeyedLock from "../locks/KeyedLock"
import { markdownFileContent, ticketFileBody } from "../markdown/fileContent"
import * as Markdown from "../markdown/Markdown"
import { FinishedStatuses } from "../projects/FinishedStatuses"
import { subscriptionIntents } from "../subscriptions/intents"
import { clearFlagWhenFinished } from "./ticketPatch"

const TicketFrontmatterOnDisk = Schema.Struct({
  id: TicketId,
  title: Schema.String,
  status: TicketStatus,
  type: StoredTicketType,
  priority: TicketPriority.pipe(
    Schema.withDecodingDefaultTypeKey(Effect.succeed("med" as const))
  ),
  rank: TicketRank,
  estimate: Schema.optionalKey(Schema.Union([Schema.Finite, Schema.String])),
  tags: Schema.Array(TagName).pipe(
    Schema.withDecodingDefaultTypeKey(Effect.succeed([]))
  ),
  branches: Schema.optionalKey(
    Schema.Array(TicketBranchEntry).check(
      Schema.makeFilter(
        (entries) =>
          new Set(entries.map((entry) => entry.branch)).size === entries.length,
        { expected: "unique branch names" }
      )
    )
  ),
  repo: Schema.optionalKey(Schema.String),
  ignoredBranches: Schema.optionalKey(Schema.Array(Schema.String)),
  branchAutoLinkDisabled: Schema.optionalKey(Schema.Boolean),
  branch: Schema.optionalKey(Schema.NullOr(Schema.String)),
  pr: Schema.optionalKey(Schema.NullOr(Schema.Finite)),
  prState: Schema.optionalKey(Schema.NullOr(PullRequestState)),
  prDraft: Schema.optionalKey(Schema.Boolean),
  lastTransitionedPr: Schema.optionalKey(Schema.NullOr(Schema.Finite)),
  assignees: Schema.optionalKey(Schema.Array(Schema.String)),
  assignee: Schema.optionalKey(Schema.NullOr(Schema.String)),
  parent: Schema.optionalKey(TicketId),
  archivedAt: Schema.NullOr(Schema.DateFromString).pipe(
    Schema.withDecodingDefaultTypeKey(Effect.succeed(null))
  ),
  flag: Schema.optionalKey(TicketFlag),
  splitFrom: Schema.optionalKey(TicketId),
  movedFrom: Schema.optionalKey(Schema.Array(Schema.String)),
  blockedBy: Schema.optionalKey(Schema.Array(TicketId)),
  relatedTo: Schema.optionalKey(Schema.Array(TicketId)),
  duplicateOf: Schema.optionalKey(TicketId),
  createdBy: Schema.String,
  createdAt: Schema.DateFromString,
  updatedBy: Schema.optionalKey(Schema.String),
  updatedAt: Schema.DateFromString
})

const gitKeysOnDisk = [
  "branches",
  "repo",
  "ignoredBranches",
  "branchAutoLinkDisabled",
  "branch",
  "pr",
  "prState",
  "prDraft",
  "lastTransitionedPr"
] as const

const TicketGitValue = {
  repo: Schema.optional(Schema.String),
  branch: Schema.NullOr(Schema.String),
  branchAutoLinkDisabled: Schema.optional(Schema.Boolean),
  pr: Schema.NullOr(Schema.Finite),
  prState: Schema.NullOr(PullRequestState),
  prDraft: Schema.optional(Schema.Boolean),
  prBase: Schema.optional(Schema.String),
  lastTransitionedPr: Schema.NullOr(Schema.Finite),
  stack: Schema.optional(Schema.Array(TicketBranchEntry)),
  ignoredBranches: Schema.optional(Schema.Array(Schema.String))
}

const TicketFrontmatterValue = Schema.Struct({
  ...Struct.evolve(
    Struct.omit(TicketFrontmatterOnDisk.fields, ["assignee", ...gitKeysOnDisk]),
    {
      estimate: () => Schema.optional(Estimate),
      assignees: () => Schema.Array(Schema.String),
      parent: () => Schema.optional(TicketId),
      splitFrom: () => Schema.optional(TicketId),
      blockedBy: () => Schema.optional(Schema.Array(TicketId)),
      relatedTo: () => Schema.optional(Schema.Array(TicketId)),
      duplicateOf: () => Schema.optional(TicketId),
      updatedBy: () => Schema.String
    }
  ),
  ...TicketGitValue
})

const gitKeysInMemory = [
  "repo",
  "branch",
  "branchAutoLinkDisabled",
  "pr",
  "prState",
  "prDraft",
  "prBase",
  "lastTransitionedPr",
  "stack",
  "ignoredBranches"
] as const satisfies ReadonlyArray<keyof typeof TicketGitValue>

type TicketGitOnDisk = Readonly<
  Pick<typeof TicketFrontmatterOnDisk.Type, (typeof gitKeysOnDisk)[number]>
>
type TicketGit = Readonly<Schema.Struct.Type<typeof TicketGitValue>>

const branchEntryOnDisk = (entry: TicketBranchEntry): TicketBranchEntry =>
  Object.assign(
    { branch: entry.branch },
    entry.base === undefined ? {} : { base: entry.base },
    entry.pr === undefined ? {} : { pr: entry.pr },
    entry.prState === undefined ? {} : { prState: entry.prState },
    entry.prDraft ? { prDraft: true as const } : {},
    entry.landed ? { landed: true as const } : {}
  )

const gitFromDisk = (input: TicketGitOnDisk): TicketGit => {
  const [own, ...stack] = input.branches ?? []
  const flags = Object.assign(
    {},
    input.branchAutoLinkDisabled ? { branchAutoLinkDisabled: true } : {},
    input.ignoredBranches && input.ignoredBranches.length > 0
      ? { ignoredBranches: input.ignoredBranches }
      : {}
  )
  if (own === undefined) {
    return Object.assign(
      flags,
      input.repo === undefined || !input.branch ? {} : { repo: input.repo },
      {
        branch: input.branch ?? null,
        pr: input.pr ?? null,
        prState: input.prState ?? null,
        lastTransitionedPr: input.lastTransitionedPr ?? null
      },
      input.prDraft ? { prDraft: true } : {}
    )
  }
  return Object.assign(
    flags,
    input.repo === undefined ? {} : { repo: input.repo },
    {
      branch: own.branch,
      pr: own.pr ?? null,
      prState: own.prState ?? null,
      lastTransitionedPr: own.landed ? (own.pr ?? null) : null
    },
    own.prDraft ? { prDraft: true } : {},
    own.base === undefined ? {} : { prBase: own.base },
    stack.length > 0 ? { stack } : {}
  )
}

const gitToDisk = (input: TicketGit): TicketGitOnDisk => {
  const own: ReadonlyArray<TicketBranchEntry> =
    input.branch === null
      ? []
      : [
          Object.assign(
            { branch: input.branch },
            input.prBase === undefined ? {} : { base: input.prBase },
            input.pr === null ? {} : { pr: input.pr },
            input.prState === null ? {} : { prState: input.prState },
            { prDraft: input.prDraft ?? false },
            {
              landed: input.pr !== null && input.lastTransitionedPr === input.pr
            }
          )
        ]
  const stack = input.branch === null ? [] : (input.stack ?? [])
  const branches = [...own, ...stack].map(branchEntryOnDisk)
  return Object.assign(
    {},
    branches.length > 0 ? { branches } : {},
    branches.length > 0 && input.repo !== undefined ? { repo: input.repo } : {},
    input.ignoredBranches && input.ignoredBranches.length > 0
      ? { ignoredBranches: input.ignoredBranches }
      : {},
    input.branchAutoLinkDisabled
      ? { branchAutoLinkDisabled: true as const }
      : {}
  )
}

type DecodedEstimate = Readonly<{ estimate?: Estimate }>

const decodedEstimate = (
  token: number | string | undefined
): DecodedEstimate => {
  const estimate = token === undefined ? null : parseEstimateToken(token)
  return estimate === null ? {} : { estimate }
}

export const TicketFrontmatter = TicketFrontmatterOnDisk.pipe(
  Schema.decodeTo(
    Schema.toType(TicketFrontmatterValue),
    SchemaTransformation.transform({
      decode: (input) =>
        Object.assign(
          Struct.omit(input, [
            "assignee",
            "assignees",
            "updatedBy",
            "parent",
            "splitFrom",
            "blockedBy",
            "relatedTo",
            "duplicateOf",
            "estimate",
            ...gitKeysOnDisk
          ]),
          {
            assignees:
              input.assignees ??
              (input.assignee === undefined || input.assignee === null
                ? []
                : [input.assignee]),
            updatedBy: input.updatedBy ?? input.createdBy,
            ...(input.parent ? { parent: input.parent } : {}),
            ...(input.splitFrom ? { splitFrom: input.splitFrom } : {}),
            ...(input.blockedBy?.length ? { blockedBy: input.blockedBy } : {}),
            ...(input.relatedTo?.length ? { relatedTo: input.relatedTo } : {}),
            ...(input.duplicateOf ? { duplicateOf: input.duplicateOf } : {})
          },
          gitFromDisk(input),
          decodedEstimate(input.estimate)
        ),
      encode: (input) =>
        Object.assign(
          Struct.omit(input, [
            "parent",
            "splitFrom",
            "blockedBy",
            "relatedTo",
            "duplicateOf",
            "estimate",
            ...gitKeysInMemory
          ]),
          gitToDisk(input),
          input.parent ? { parent: input.parent } : {},
          input.splitFrom ? { splitFrom: input.splitFrom } : {},
          input.blockedBy?.length ? { blockedBy: input.blockedBy } : {},
          input.relatedTo?.length ? { relatedTo: input.relatedTo } : {},
          input.duplicateOf ? { duplicateOf: input.duplicateOf } : {},
          input.estimate ? { estimate: estimateToken(input.estimate) } : {}
        )
    })
  )
)
export type TicketFrontmatter = typeof TicketFrontmatter.Type

export class MalformedTicketDocument extends Data.TaggedError(
  "MalformedTicketDocument"
)<{
  readonly orgSlug: string
  readonly slug: string
  readonly ticketId: string
  readonly path: string
  readonly reason: string
  readonly cause: unknown
}> {}

export interface TicketDocument extends TicketFrontmatter {
  readonly body: string
  readonly commentsRegion: string
}

const encodeTicketFrontmatter = Schema.encodeSync(TicketFrontmatter)

export const ticketFileContent = (document: TicketDocument): string =>
  markdownFileContent(
    encodeTicketFrontmatter(document),
    ticketFileBody(document.body, document.commentsRegion)
  )

export type TicketActivityOptions = Readonly<{
  cause?: ActivityCause
  statusCause?: ActivityCause
  extra?: ReadonlyArray<TicketActivityChange>
  silent?: boolean
  archiveReason?: string
}>

export type TicketRemoveOptions = Readonly<{ writeLockHeld?: boolean }>

export type TicketCreateOptions = Readonly<{ autoSubscribe?: boolean }>

export class TicketDocs extends Context.Service<
  TicketDocs,
  Readonly<{
    listIds: (
      orgSlug: string,
      slug: string
    ) => Effect.Effect<ReadonlyArray<TicketId>, Markdown.MarkdownError>
    read: (
      orgSlug: string,
      slug: string,
      id: string
    ) => Effect.Effect<
      TicketDocument,
      NotFound | Markdown.MarkdownError | MalformedTicketDocument
    >
    create: (
      orgSlug: string,
      slug: string,
      document: TicketDocument,
      onPersist?: (document: TicketDocument) => Effect.Effect<void>,
      options?: TicketCreateOptions
    ) => Effect.Effect<void, Markdown.MarkdownError | Markdown.TicketIdTaken>
    write: (
      orgSlug: string,
      slug: string,
      id: string,
      document: TicketDocument
    ) => Effect.Effect<void, Markdown.MarkdownError>
    update: <E, R>(
      orgSlug: string,
      slug: string,
      id: string,
      transform: (
        document: TicketDocument
      ) => Effect.Effect<TicketDocument, E, R>,
      onPersist?: (document: TicketDocument) => Effect.Effect<void, E, R>,
      activity?: TicketActivityOptions
    ) => Effect.Effect<
      TicketDocument,
      NotFound | Markdown.MarkdownError | MalformedTicketDocument | E,
      R | ActivityActor
    >
    remove: (
      orgSlug: string,
      slug: string,
      id: string,
      onPersist?: Effect.Effect<void>,
      options?: TicketRemoveOptions
    ) => Effect.Effect<void, NotFound | Markdown.MarkdownError>
    readRaw: (
      orgSlug: string,
      slug: string,
      id: string
    ) => Effect.Effect<
      { path: string; content: string },
      NotFound | Markdown.MarkdownError
    >
  }>
>()("@pp/server-core/tickets/TicketDocs") {}

const decodeFrontmatter = Schema.decodeUnknownEffect(TicketFrontmatter)
const encodeFrontmatter = Schema.encodeSync(TicketFrontmatter)
const decodeTicketId = Schema.decodeUnknownEffect(TicketId)

function toDocument(
  frontmatter: TicketFrontmatter,
  body: string,
  commentsRegion: string
): TicketDocument {
  return {
    ...frontmatter,
    body,
    commentsRegion
  }
}

const annotateTicketDoc = <A, E, R>(
  operation: string,
  orgSlug: string,
  slug: string,
  attributes: Record<string, unknown>,
  effect: Effect.Effect<A, E, R>
): Effect.Effect<A, E, R> => {
  const annotations = {
    module: "TicketDocs",
    operation,
    orgSlug,
    slug,
    ...attributes
  }
  return Effect.annotateCurrentSpan(annotations).pipe(
    Effect.andThen(effect),
    Effect.annotateLogs(annotations)
  )
}

const make = Effect.gen(function* () {
  const markdown = yield* Markdown.Markdown
  const keyedLock = yield* KeyedLock.KeyedLock
  const ticketActivity = yield* TicketActivity.TicketActivity
  const finishedStatuses = yield* FinishedStatuses

  const withMutationLock = <A, E, R>(
    orgSlug: string,
    slug: string,
    id: string,
    effect: Effect.Effect<A, E, R>
  ): Effect.Effect<A, E, R> =>
    keyedLock.withLock(KeyedLock.LockKey.ticketWrite(orgSlug, slug, id), effect)

  const listIds = Effect.fn("TicketDocs.listIds")(function* (
    orgSlug: string,
    slug: string
  ) {
    return yield* annotateTicketDoc(
      "listIds",
      orgSlug,
      slug,
      {},
      markdown
        .listTicketIds(orgSlug, slug)
        .pipe(
          Effect.flatMap((ids) =>
            Effect.forEach(ids, (id) => decodeTicketId(id).pipe(Effect.orDie))
          )
        )
    )
  })

  const read = Effect.fn("TicketDocs.read")(function* (
    orgSlug: string,
    slug: string,
    id: string
  ) {
    return yield* annotateTicketDoc(
      "read",
      orgSlug,
      slug,
      { ticketId: id },
      Effect.gen(function* () {
        const file = yield* markdown.readTicketParts(orgSlug, slug, id)
        const frontmatter = yield* decodeFrontmatter(file.data).pipe(
          Effect.mapError(
            (cause) =>
              new MalformedTicketDocument({
                orgSlug,
                slug,
                ticketId: id,
                path: `orgs/${orgSlug}/projects/${slug}/tickets/${id}.md`,
                cause,
                reason: "invalid_frontmatter"
              })
          )
        )
        return toDocument(frontmatter, file.description, file.region)
      })
    )
  })

  const create = Effect.fn("TicketDocs.create")(function* (
    orgSlug: string,
    slug: string,
    document: TicketDocument,
    onPersist?: (document: TicketDocument) => Effect.Effect<void>,
    options: TicketCreateOptions = {}
  ) {
    return yield* annotateTicketDoc(
      "create",
      orgSlug,
      slug,
      { ticketId: document.id },
      withMutationLock(
        orgSlug,
        slug,
        document.id,
        ticketActivity
          .record(
            orgSlug,
            slug,
            {
              kind: "ticket",
              id: document.id,
              content: ticketFileContent(document)
            },
            relationChanges(null, document),
            null,
            markdown.createTicketFile(
              orgSlug,
              slug,
              document.id,
              encodeFrontmatter(document),
              ticketFileBody(document.body, document.commentsRegion)
            ),
            ticketCreatedEvents(document),
            options.autoSubscribe === false
              ? {}
              : {
                  subscriptions: subscriptionIntents(null, document),
                  notices: inboxNotices(null, document)
                }
          )
          .pipe(
            Effect.provideService(
              ActivityActor,
              ActivityActor.user(document.createdBy)
            )
          )
          .pipe(
            Effect.andThen(
              Effect.suspend(() =>
                onPersist ? onPersist(document) : Effect.void
              )
            ),
            Effect.uninterruptible
          )
      )
    )
  })

  const write = Effect.fn("TicketDocs.write")(function* (
    orgSlug: string,
    slug: string,
    id: string,
    document: TicketDocument
  ) {
    return yield* annotateTicketDoc(
      "write",
      orgSlug,
      slug,
      { ticketId: id },
      markdown.writeTicketWithRegion(
        orgSlug,
        slug,
        id,
        encodeFrontmatter(document),
        document.body,
        document.commentsRegion
      )
    )
  })

  const update = Effect.fn("TicketDocs.update")(function* <E, R>(
    orgSlug: string,
    slug: string,
    id: string,
    transform: (
      document: TicketDocument
    ) => Effect.Effect<TicketDocument, E, R>,
    onPersist?: (document: TicketDocument) => Effect.Effect<void, E, R>,
    activity: TicketActivityOptions = {}
  ) {
    return yield* annotateTicketDoc(
      "update",
      orgSlug,
      slug,
      { ticketId: id },
      withMutationLock(
        orgSlug,
        slug,
        id,
        Effect.gen(function* () {
          const current = yield* read(orgSlug, slug, id)
          const transformed = yield* transform(current)
          if (transformed === current) {
            if (onPersist) yield* onPersist(current)
            return current
          }
          const actor = yield* ActivityActor
          const touched =
            transformed.updatedAt.getTime() !== current.updatedAt.getTime()
          const finished =
            current.status === transformed.status
              ? null
              : yield* finishedStatuses.forProject(orgSlug, slug)
          const stamped = touched
            ? {
                ...transformed,
                updatedBy: activityActorUserId(actor) ?? transformed.updatedBy
              }
            : transformed
          const next =
            finished === null
              ? stamped
              : clearFlagWhenFinished(current, stamped, finished)
          const changes = activity.silent
            ? []
            : [
                ...ticketChanges(current, next, activity.archiveReason),
                ...(activity.extra ?? [])
              ]
          const events =
            activity.silent || finished === null
              ? []
              : ticketEvents(current, next, finished)
          return yield* Effect.gen(function* () {
            yield* ticketActivity.record(
              orgSlug,
              slug,
              { kind: "ticket", id, content: ticketFileContent(next) },
              [
                ...changes.map((change) =>
                  change.kind === "status_changed" &&
                  activity.statusCause !== undefined
                    ? { ticketId: next.id, change, cause: activity.statusCause }
                    : { ticketId: next.id, change }
                ),
                ...(activity.silent ? [] : relationChanges(current, next))
              ],
              activity.cause ?? null,
              write(orgSlug, slug, id, next),
              events,
              {
                subscriptions: subscriptionIntents(current, next),
                notices: activity.silent ? [] : inboxNotices(current, next),
                finished:
                  finished ??
                  (current.archivedAt === null && next.archivedAt !== null
                    ? yield* finishedStatuses.forProject(orgSlug, slug)
                    : null),
                statusBefore: current.status,
                touched:
                  !activity.silent &&
                  current.commentsRegion !== next.commentsRegion
              }
            )
            if (onPersist) yield* onPersist(next)
            return next
          }).pipe(Effect.uninterruptible)
        })
      )
    )
  })

  const remove = Effect.fn("TicketDocs.remove")(function* (
    orgSlug: string,
    slug: string,
    id: string,
    onPersist: Effect.Effect<void> = Effect.void,
    options: TicketRemoveOptions = {}
  ) {
    const removal = markdown
      .removeTicketFile(orgSlug, slug, id)
      .pipe(
        Effect.andThen(ticketActivity.removeTicket(orgSlug, slug, id)),
        Effect.andThen(onPersist)
      )
    return yield* annotateTicketDoc(
      "remove",
      orgSlug,
      slug,
      { ticketId: id },
      options.writeLockHeld
        ? removal
        : withMutationLock(orgSlug, slug, id, removal)
    )
  })

  const readRaw = Effect.fn("TicketDocs.readRaw")(function* (
    orgSlug: string,
    slug: string,
    id: string
  ) {
    return yield* annotateTicketDoc(
      "readRaw",
      orgSlug,
      slug,
      { ticketId: id },
      markdown.readTicketFileRaw(orgSlug, slug, id)
    )
  })

  return TicketDocs.of({
    listIds,
    read,
    create,
    write,
    update,
    remove,
    readRaw
  })
})

export const layer = Layer.effect(TicketDocs, make)
