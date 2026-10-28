import {
  Estimate,
  estimateToken,
  parseEstimateToken,
  type ActivityActor,
  type ActivityCause,
  type TicketActivityChange,
  PullRequestState,
  TagName,
  TicketId,
  TicketPriority,
  TicketBranchEntry,
  TicketStatus,
  TicketType,
  type NotFound
} from "@pp/shared"
import * as Context from "effect/Context"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import * as SchemaTransformation from "effect/SchemaTransformation"
import * as Struct from "effect/Struct"

import { markdownFileContent, ticketFileBody } from "../markdown/fileContent"
import type { MarkdownError, TicketIdTaken } from "../markdown/Markdown"

const TicketFrontmatterOnDisk = Schema.Struct({
  id: TicketId,
  title: Schema.String,
  status: TicketStatus,
  type: TicketType,
  priority: TicketPriority.pipe(
    Schema.withDecodingDefaultTypeKey(Effect.succeed("med" as const))
  ),
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
  splitFrom: Schema.optionalKey(TicketId),
  createdBy: Schema.String,
  createdAt: Schema.DateFromString,
  updatedBy: Schema.optionalKey(Schema.String),
  updatedAt: Schema.DateFromString
})

const gitKeysOnDisk = [
  "branches",
  "ignoredBranches",
  "branchAutoLinkDisabled",
  "branch",
  "pr",
  "prState",
  "prDraft",
  "lastTransitionedPr"
] as const

const TicketGitValue = {
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
      updatedBy: () => Schema.String
    }
  ),
  ...TicketGitValue
})

const gitKeysInMemory = [
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
            ...(input.splitFrom ? { splitFrom: input.splitFrom } : {})
          },
          gitFromDisk(input),
          decodedEstimate(input.estimate)
        ),
      encode: (input) =>
        Object.assign(
          Struct.omit(input, [
            "parent",
            "splitFrom",
            "estimate",
            ...gitKeysInMemory
          ]),
          gitToDisk(input),
          input.parent ? { parent: input.parent } : {},
          input.splitFrom ? { splitFrom: input.splitFrom } : {},
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

export interface TicketDocsShape {
  readonly listIds: (
    orgSlug: string,
    slug: string
  ) => Effect.Effect<ReadonlyArray<TicketId>, MarkdownError>
  readonly read: (
    orgSlug: string,
    slug: string,
    id: string
  ) => Effect.Effect<
    TicketDocument,
    NotFound | MarkdownError | MalformedTicketDocument
  >
  readonly create: (
    orgSlug: string,
    slug: string,
    document: TicketDocument,
    onPersist?: (document: TicketDocument) => Effect.Effect<void>
  ) => Effect.Effect<void, MarkdownError | TicketIdTaken>
  readonly write: (
    orgSlug: string,
    slug: string,
    id: string,
    document: TicketDocument
  ) => Effect.Effect<void, MarkdownError>
  readonly update: <E, R>(
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
    NotFound | MarkdownError | MalformedTicketDocument | E,
    R | ActivityActor
  >
  readonly remove: (
    orgSlug: string,
    slug: string,
    id: string,
    onPersist?: Effect.Effect<void>
  ) => Effect.Effect<void, NotFound | MarkdownError>
  readonly readRaw: (
    orgSlug: string,
    slug: string,
    id: string
  ) => Effect.Effect<
    { path: string; content: string },
    NotFound | MarkdownError
  >
}

export class TicketDocs extends Context.Service<TicketDocs, TicketDocsShape>()(
  "@pp/server-core/tickets/TicketDocs"
) {}
