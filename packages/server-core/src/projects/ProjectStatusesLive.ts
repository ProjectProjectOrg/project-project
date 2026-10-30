import { Db } from "@pp/db"
import { projectStatus } from "@pp/db/schema"
import {
  Conflict,
  Forbidden,
  NotFound,
  OrderKey,
  ProjectStatus,
  StatusColor,
  StatusLabel,
  StatusSlug,
  deriveStatusSlug,
  hasBaselineOrder,
  isReservedStatusSlug,
  phaseEndNeighbors,
  pickStatusColor
} from "@pp/shared"
import { ProjectScope } from "@pp/shared"
import { and, eq } from "drizzle-orm"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import { generateKeyBetween } from "fractional-indexing"

import * as TicketCommands from "../tickets/TicketCommands"
import { TicketIndex } from "../tickets/TicketIndex"
import { ProjectStatuses, type ProjectStatusesShape } from "./ProjectStatuses"

const makeSlug = Schema.decodeUnknownSync(StatusSlug)
const makeLabel = Schema.decodeUnknownSync(StatusLabel)
const makeColor = Schema.decodeUnknownSync(StatusColor)

const rowToStatus = (r: typeof projectStatus.$inferSelect): ProjectStatus => ({
  slug: makeSlug(r.slug),
  label: makeLabel(r.label),
  icon: r.icon,
  color: makeColor(r.color),
  orderKey: OrderKey.make(r.orderKey),
  description: r.description,
  createdBy: r.createdBy,
  createdAt: r.createdAt
})

export const ProjectStatusesLive = Layer.effect(
  ProjectStatuses,
  Effect.gen(function* () {
    const db = yield* Db
    const ticketIndex = yield* TicketIndex
    const commands = yield* TicketCommands.TicketCommands

    const list: ProjectStatusesShape["list"] = () =>
      Effect.gen(function* () {
        const { projectId } = yield* ProjectScope
        const rows = yield* db.query.projectStatus
          .findMany({
            where: {
              RAW: (table, _operators) =>
                _operators.eq(table.projectId, projectId)
            },
            orderBy: (table, operators) => operators.asc(table.orderKey)
          })
          .pipe(Effect.orDie)
        return rows.map(rowToStatus)
      })

    const DEFAULT_ICON = "Circle"

    const rewriteTicketsStatus = (
      orgSlug: string,
      slug: string,
      ids: ReadonlyArray<string>,
      toSlug: string,
      reason: "renamed" | "removed"
    ) =>
      Effect.forEach(
        ids,
        (id) =>
          commands.replaceStatus(orgSlug, slug, id, toSlug, reason).pipe(
            Effect.catchTag("NotFound", () => Effect.succeed(false)),
            Effect.catchTag("MalformedTicketDocument", () =>
              Effect.succeed(false)
            )
          ),
        { concurrency: 8 }
      )

    const create: ProjectStatusesShape["create"] = (input) =>
      Effect.gen(function* () {
        const { userId, projectId } = yield* ProjectScope

        const derived = deriveStatusSlug(input.label)
        if (derived.length === 0)
          return yield* new Conflict({ reason: "invalid_label" })
        if (isReservedStatusSlug(derived))
          return yield* new Conflict({ reason: "reserved_slug" })

        const existing = yield* db.query.projectStatus
          .findMany({
            where: {
              RAW: (table, _operators) =>
                _operators.eq(table.projectId, projectId)
            },
            orderBy: (table, operators) => operators.asc(table.orderKey)
          })
          .pipe(Effect.orDie)

        if (existing.some((s) => s.slug === derived))
          return yield* new Conflict({ reason: "slug_exists" })

        const nextKey = generateKeyBetween(
          ...phaseEndNeighbors(existing, input.phase ?? "started")
        )

        const color =
          input.color ?? pickStatusColor(existing.map((s) => s.color))
        const icon = input.icon ?? DEFAULT_ICON

        const inserted = yield* db
          .insert(projectStatus)
          .values({
            projectId,
            slug: derived,
            label: input.label,
            icon,
            color,
            description: input.description ?? null,
            orderKey: nextKey,
            createdBy: userId
          })
          .returning()
          .pipe(Effect.orDie)
        return rowToStatus(inserted[0])
      })

    const update: ProjectStatusesShape["update"] = (statusSlug, input) =>
      Effect.gen(function* () {
        const { orgSlug, slug, projectId } = yield* ProjectScope

        const current = yield* db.query.projectStatus
          .findFirst({
            where: {
              RAW: (table, _operators) =>
                _operators.and(
                  _operators.eq(table.projectId, projectId),
                  _operators.eq(table.slug, statusSlug)
                )!
            }
          })
          .pipe(Effect.orDie)
        if (!current) return yield* new NotFound()

        const touchesIdentity =
          input.label !== undefined || input.icon !== undefined
        if (isReservedStatusSlug(statusSlug) && touchesIdentity)
          return yield* new Forbidden()

        const description =
          input.description === undefined
            ? current.description
            : input.description

        const newLabel = input.label ?? current.label
        const newSlug = input.label
          ? deriveStatusSlug(input.label)
          : current.slug

        if (newSlug.length === 0)
          return yield* new Conflict({ reason: "invalid_label" })

        if (newSlug !== current.slug) {
          if (isReservedStatusSlug(newSlug))
            return yield* new Conflict({ reason: "reserved_slug" })
          const collision = yield* db.query.projectStatus
            .findFirst({
              where: {
                RAW: (table, _operators) =>
                  _operators.and(
                    _operators.eq(table.projectId, projectId),
                    _operators.eq(table.slug, newSlug)
                  )!
              }
            })
            .pipe(Effect.orDie)
          if (collision) return yield* new Conflict({ reason: "slug_exists" })
        }

        const cosmetic = newSlug === current.slug

        if (cosmetic) {
          const updated = yield* db
            .update(projectStatus)
            .set({
              label: newLabel,
              icon: input.icon ?? current.icon,
              color: input.color ?? current.color,
              description
            })
            .where(
              and(
                eq(projectStatus.projectId, projectId),
                eq(projectStatus.slug, statusSlug)
              )
            )
            .returning()
            .pipe(Effect.orDie)
          return rowToStatus(updated[0])
        }

        const indexProject = yield* ticketIndex.projectFor(orgSlug, slug)
        const affectedIds = yield* ticketIndex.findTicketIdsByStatus(
          indexProject,
          current.slug
        )
        yield* rewriteTicketsStatus(
          orgSlug,
          slug,
          affectedIds,
          newSlug,
          "renamed"
        )
        const updated = yield* db
          .update(projectStatus)
          .set({
            slug: newSlug,
            label: newLabel,
            icon: input.icon ?? current.icon,
            color: input.color ?? current.color,
            description
          })
          .where(
            and(
              eq(projectStatus.projectId, projectId),
              eq(projectStatus.slug, statusSlug)
            )
          )
          .returning()
          .pipe(Effect.orDie)
        return rowToStatus(updated[0])
      })

    const reorder: ProjectStatusesShape["reorder"] = (statusSlug, input) =>
      Effect.gen(function* () {
        const { projectId } = yield* ProjectScope
        const existing = yield* db.query.projectStatus
          .findMany({
            where: {
              RAW: (table, _operators) =>
                _operators.eq(table.projectId, projectId)
            }
          })
          .pipe(Effect.orDie)
        if (!existing.some((s) => s.slug === statusSlug))
          return yield* new NotFound()
        const reordered = existing.map((s) =>
          s.slug === statusSlug ? { ...s, orderKey: input.orderKey } : s
        )
        if (hasBaselineOrder(existing) && !hasBaselineOrder(reordered))
          return yield* new Conflict({ reason: "baseline_order" })
        const updated = yield* db
          .update(projectStatus)
          .set({ orderKey: input.orderKey })
          .where(
            and(
              eq(projectStatus.projectId, projectId),
              eq(projectStatus.slug, statusSlug)
            )
          )
          .returning()
          .pipe(Effect.orDie)
        if (updated.length === 0) return yield* new NotFound()
        return rowToStatus(updated[0])
      })

    const remove: ProjectStatusesShape["remove"] = (statusSlug, input) =>
      Effect.gen(function* () {
        const { orgSlug, slug, projectId } = yield* ProjectScope
        if (isReservedStatusSlug(statusSlug)) return yield* new Forbidden()

        const current = yield* db.query.projectStatus
          .findFirst({
            where: {
              RAW: (table, _operators) =>
                _operators.and(
                  _operators.eq(table.projectId, projectId),
                  _operators.eq(table.slug, statusSlug)
                )!
            }
          })
          .pipe(Effect.orDie)
        if (!current) return yield* new NotFound()

        const indexProject = yield* ticketIndex.projectFor(orgSlug, slug)
        const affectedIds = yield* ticketIndex.findTicketIdsByStatus(
          indexProject,
          statusSlug
        )
        if (affectedIds.length > 0) {
          if (!input.reassignTo)
            return yield* new Conflict({ reason: "reassign_required" })
          if (input.reassignTo === statusSlug)
            return yield* new Conflict({ reason: "reassign_target_invalid" })
          const reassignTo = input.reassignTo
          const target = yield* db.query.projectStatus
            .findFirst({
              where: {
                RAW: (table, _operators) =>
                  _operators.and(
                    _operators.eq(table.projectId, projectId),
                    _operators.eq(table.slug, reassignTo)
                  )!
              }
            })
            .pipe(Effect.orDie)
          if (!target)
            return yield* new Conflict({ reason: "reassign_target_missing" })

          yield* rewriteTicketsStatus(
            orgSlug,
            slug,
            affectedIds,
            input.reassignTo,
            "removed"
          )
        }
        yield* db
          .delete(projectStatus)
          .where(
            and(
              eq(projectStatus.projectId, projectId),
              eq(projectStatus.slug, statusSlug)
            )
          )
          .pipe(Effect.orDie)
      })

    return {
      list,
      create,
      update,
      reorder,
      remove
    }
  })
)
