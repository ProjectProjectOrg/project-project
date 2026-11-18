import { Db } from "@pp/db"
import { projectImport } from "@pp/db/schema"
import {
  type ActivityActor,
  type Conflict,
  type FixReferenceInput,
  type Forbidden,
  type MentionInvalid,
  type NotFound,
  ProjectExportManifestJson,
  ProjectScope,
  type ReferencesToFix,
  type ReferenceToFix,
  Validation
} from "@pp/shared"
import { and, desc, eq } from "drizzle-orm"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"

import type * as Markdown from "../markdown/Markdown"
import * as TicketCommands from "../tickets/TicketCommands"
import * as TicketDocs from "../tickets/TicketDocs"
import * as TicketIndex from "../tickets/TicketIndex"
import type { TicketReadError } from "../tickets/ticketPresentation"
import * as Users from "../users/Users"
import { applyReferenceFix, referenceCandidates } from "./references"

const decodeManifest = Schema.decodeUnknownOption(ProjectExportManifestJson)

export class ProjectReferences extends Context.Service<
  ProjectReferences,
  Readonly<{
    list: () => Effect.Effect<
      ReferencesToFix,
      Markdown.MarkdownError,
      ProjectScope
    >
    fix: (
      input: FixReferenceInput
    ) => Effect.Effect<
      ReferencesToFix,
      | Markdown.MarkdownError
      | Forbidden
      | NotFound
      | Validation
      | MentionInvalid
      | Conflict
      | TicketReadError,
      ProjectScope | ActivityActor
    >
  }>
>()("@pp/server-core/projects/ProjectReferences") {}

const originOf = (url: string | null) => {
  if (url === null) return null
  try {
    return new URL(url).origin
  } catch {
    return null
  }
}

const make = Effect.gen(function* () {
  const db = yield* Db
  const ticketDocs = yield* TicketDocs.TicketDocs
  const ticketIndex = yield* TicketIndex.TicketIndex
  const users = yield* Users.Users
  const commands = yield* TicketCommands.TicketCommands

  const oldOrigin = Effect.fn("ProjectReferences.oldOrigin")(function* (
    projectId: string
  ) {
    const [row] = yield* db
      .select({ manifest: projectImport.manifest })
      .from(projectImport)
      .where(
        and(
          eq(projectImport.destinationProjectId, projectId),
          eq(projectImport.status, "succeeded")
        )
      )
      .orderBy(desc(projectImport.updatedAt))
      .limit(1)
      .pipe(Effect.orDie)
    if (!row) return null
    return Option.match(decodeManifest(row.manifest), {
      onNone: () => null,
      onSome: (manifest) => originOf(manifest.source.url)
    })
  })

  const descriptions = Effect.fn("ProjectReferences.descriptions")(
    function* () {
      const scope = yield* ProjectScope
      const ids = yield* ticketDocs.listIds(scope.orgSlug, scope.slug)
      const documents = yield* Effect.forEach(
        ids,
        (id) =>
          ticketDocs.read(scope.orgSlug, scope.slug, id).pipe(
            Effect.map((document) => [{ id, body: document.body }]),
            Effect.catchTags({
              NotFound: () => Effect.succeed([]),
              MalformedTicketDocument: () => Effect.succeed([])
            })
          ),
        { concurrency: 16 }
      )
      return documents.flat()
    }
  )

  const list = Effect.fn("ProjectReferences.list")(function* () {
    const scope = yield* ProjectScope
    const origin = yield* oldOrigin(scope.projectId)
    const found = (yield* descriptions()).flatMap(({ id, body }) =>
      referenceCandidates(body, origin).map((candidate) =>
        Object.assign({ ticketId: id }, candidate)
      )
    )
    const ticketTargets = [
      ...new Set(found.flatMap((r) => (r.kind === "ticket" ? [r.target] : [])))
    ]
    const existingTickets = yield* ticketIndex.existingIds(scope, ticketTargets)
    const mentionableTickets = yield* ticketIndex.mentionableIds(
      scope,
      ticketTargets
    )
    const userTargets = [
      ...new Set(found.flatMap((r) => (r.kind === "user" ? [r.target] : [])))
    ]
    const existingUsers = new Set(
      (yield* users.findManyByIds(userTargets)).map((user) => user.id)
    )
    const resolves = (reference: ReferenceToFix) => {
      if (reference.kind === "link") return false
      if (reference.kind === "user") return existingUsers.has(reference.target)
      return (
        existingTickets.has(reference.target) ||
        mentionableTickets.has(reference.target)
      )
    }
    return { items: found.filter((reference) => !resolves(reference)) }
  })

  const fix = Effect.fn("ProjectReferences.fix")(function* (
    input: FixReferenceInput
  ) {
    const { items } = yield* list()
    const ticketIds = [
      ...new Set(
        items
          .filter(
            (item) =>
              item.kind === input.kind &&
              item.target === input.target &&
              (input.ticketId === null || item.ticketId === input.ticketId)
          )
          .map((item) => item.ticketId)
      )
    ]
    const scope = yield* ProjectScope
    for (const ticketId of ticketIds) {
      const document = yield* ticketDocs.read(
        scope.orgSlug,
        scope.slug,
        ticketId
      )
      const body = applyReferenceFix(document.body, input, input.action)
      if (body !== document.body)
        yield* commands
          .update(ticketId, { body }, undefined, {
            body: document.body,
            updatedAt: document.updatedAt
          })
          .pipe(
            Effect.catchTag(
              "SprintCompletedImmutable",
              () => new Validation({ reason: "sprint_completed_immutable" })
            )
          )
    }
    return yield* list()
  })

  return ProjectReferences.of({ list, fix })
})

export const layer = Layer.effect(ProjectReferences, make)
