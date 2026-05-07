import { Effect, Schema } from "effect"
import {
  ADMIN_GATED_KINDS,
  Conflict,
  CreateGroupInput,
  Forbidden,
  Group,
  GroupColor,
  GroupDetail,
  GroupId,
  GroupKind,
  NotFound,
  TAG_DEFAULT_PALETTE,
  TicketId,
  UpdateGroupInput,
  UpdateGroupTicketsInput
} from "@projectproject/shared"
import { Markdown, type MarkdownError } from "./Markdown"
import { Projects } from "./Projects"

const MAX_CREATE_ATTEMPTS = 16

const GroupFrontmatter = Schema.Struct({
  id: GroupId,
  name: Schema.String,
  kind: Schema.optionalWith(GroupKind, { default: () => "other" as const }),
  tickets: Schema.optionalWith(Schema.Array(TicketId), { default: () => [] }),
  color: GroupColor,
  startsAt: Schema.optionalWith(Schema.NullOr(Schema.Date), {
    default: () => null
  }),
  endsAt: Schema.optionalWith(Schema.NullOr(Schema.Date), {
    default: () => null
  }),
  completedAt: Schema.optionalWith(Schema.NullOr(Schema.Date), {
    default: () => null
  }),
  createdBy: Schema.String,
  createdAt: Schema.Date,
  updatedAt: Schema.Date
})
type GroupFrontmatter = typeof GroupFrontmatter.Type

const decodeFrontmatter = Schema.decodeUnknown(GroupFrontmatter)

function nextIdFrom(ids: ReadonlyArray<string>): string {
  let max = 0
  for (const id of ids) {
    const n = Number(id.slice(2))
    if (Number.isFinite(n) && n > max) max = n
  }
  return `G-${max + 1}`
}

function bumpId(id: string): string {
  const n = Number(id.slice(2))
  return `G-${n + 1}`
}

function pickColor(used: ReadonlyArray<string>): GroupColor {
  for (const c of TAG_DEFAULT_PALETTE)
    if (!used.includes(c)) return c as GroupColor
  return TAG_DEFAULT_PALETTE[
    used.length % TAG_DEFAULT_PALETTE.length
  ] as GroupColor
}

function frontmatterToWire(fm: GroupFrontmatter): Group {
  return {
    id: fm.id,
    name: fm.name,
    kind: fm.kind,
    tickets: fm.tickets,
    color: fm.color,
    startsAt: fm.startsAt,
    endsAt: fm.endsAt,
    completedAt: fm.completedAt,
    createdBy: fm.createdBy,
    createdAt: fm.createdAt,
    updatedAt: fm.updatedAt
  }
}

function frontmatterToDisk(fm: GroupFrontmatter): Record<string, unknown> {
  return {
    id: fm.id,
    name: fm.name,
    kind: fm.kind,
    tickets: fm.tickets,
    color: fm.color,
    startsAt: fm.startsAt ? fm.startsAt.toISOString() : null,
    endsAt: fm.endsAt ? fm.endsAt.toISOString() : null,
    completedAt: fm.completedAt ? fm.completedAt.toISOString() : null,
    createdBy: fm.createdBy,
    createdAt: fm.createdAt.toISOString(),
    updatedAt: fm.updatedAt.toISOString()
  }
}

export class Groups extends Effect.Service<Groups>()("Groups", {
  effect: Effect.gen(function* () {
    const md = yield* Markdown
    const projects = yield* Projects

    const readGroup = (
      orgSlug: string,
      slug: string,
      id: string
    ): Effect.Effect<
      GroupFrontmatter & { body: string },
      NotFound | MarkdownError
    > =>
      Effect.gen(function* () {
        const file = yield* md.readGroupFile(orgSlug, slug, id)
        const fm = yield* decodeFrontmatter(file.data).pipe(Effect.orDie)
        return { ...fm, body: file.body }
      })

    const validateTicketIds = (
      orgSlug: string,
      slug: string,
      ticketIds: ReadonlyArray<string>
    ): Effect.Effect<void, Conflict | MarkdownError> =>
      Effect.gen(function* () {
        if (ticketIds.length === 0) return
        const existing = yield* md.listTicketIds(orgSlug, slug)
        const set = new Set(existing)
        for (const id of ticketIds) {
          if (!set.has(id)) {
            return yield* Effect.fail(
              new Conflict({ reason: `ticket_not_found:${id}` })
            )
          }
        }
      })

    const requireKindRole = (
      orgSlug: string,
      userId: string,
      slug: string,
      kind: GroupKind
    ): Effect.Effect<void, NotFound | Forbidden> =>
      Effect.gen(function* () {
        if (ADMIN_GATED_KINDS.has(kind)) {
          yield* projects.requireRole(orgSlug, userId, slug, ["owner", "admin"])
        } else {
          yield* projects.requireMember(orgSlug, userId, slug)
        }
      })

    const list = (
      orgSlug: string,
      userId: string,
      slug: string
    ): Effect.Effect<ReadonlyArray<Group>, NotFound | MarkdownError> =>
      Effect.gen(function* () {
        yield* projects.requireMember(orgSlug, userId, slug)
        const ids = yield* md.listGroupIds(orgSlug, slug)
        const groups = yield* Effect.forEach(
          ids,
          (id) => readGroup(orgSlug, slug, id),
          { concurrency: 8 }
        )
        return [...groups.map(frontmatterToWire)].sort(
          (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
        )
      })

    const get = (
      orgSlug: string,
      userId: string,
      slug: string,
      id: string
    ): Effect.Effect<GroupDetail, NotFound | MarkdownError> =>
      Effect.gen(function* () {
        yield* projects.requireMember(orgSlug, userId, slug)
        const g = yield* readGroup(orgSlug, slug, id)
        return { ...frontmatterToWire(g), body: g.body }
      })

    const create = (
      orgSlug: string,
      userId: string,
      slug: string,
      input: CreateGroupInput
    ): Effect.Effect<Group, NotFound | Forbidden | Conflict | MarkdownError> =>
      Effect.gen(function* () {
        const kind: GroupKind = input.kind ?? "other"
        yield* requireKindRole(orgSlug, userId, slug, kind)

        const requestedTickets = input.tickets ?? []
        yield* validateTicketIds(orgSlug, slug, requestedTickets)

        const ids = yield* md.listGroupIds(orgSlug, slug)
        let candidate = nextIdFrom(ids)

        const existing = yield* Effect.forEach(
          ids,
          (id) => readGroup(orgSlug, slug, id),
          { concurrency: 8 }
        )
        const usedColors = existing.map((g) => g.color)
        const color = input.color ?? pickColor(usedColors)

        const now = new Date()
        const fm: GroupFrontmatter = {
          id: candidate as GroupId,
          name: input.name,
          kind,
          tickets: requestedTickets,
          color,
          startsAt: input.startsAt ?? null,
          endsAt: input.endsAt ?? null,
          completedAt: null,
          createdBy: userId,
          createdAt: now,
          updatedAt: now
        }

        for (let attempt = 0; attempt < MAX_CREATE_ATTEMPTS; attempt++) {
          const result = yield* md
            .createGroupFile(
              orgSlug,
              slug,
              candidate,
              frontmatterToDisk({ ...fm, id: candidate as GroupId }),
              `# ${input.name}\n`
            )
            .pipe(
              Effect.map(() => "ok" as const),
              Effect.catchTag("GroupIdTaken", () =>
                Effect.succeed("retry" as const)
              )
            )
          if (result === "ok") {
            return frontmatterToWire({ ...fm, id: candidate as GroupId })
          }
          candidate = bumpId(candidate)
        }
        return yield* Effect.die(
          new Error(`could not allocate group id for "${slug}"`)
        )
      })

    const update = (
      orgSlug: string,
      userId: string,
      slug: string,
      id: string,
      input: UpdateGroupInput
    ): Effect.Effect<GroupDetail, NotFound | Forbidden | MarkdownError> =>
      Effect.gen(function* () {
        yield* projects.get(orgSlug, userId, slug)

        const existing = yield* readGroup(orgSlug, slug, id)
        yield* requireKindRole(orgSlug, userId, slug, existing.kind)

        const next: GroupFrontmatter = {
          ...existing,
          name: input.name ?? existing.name,
          color: input.color ?? existing.color,
          startsAt:
            input.startsAt !== undefined ? input.startsAt : existing.startsAt,
          endsAt: input.endsAt !== undefined ? input.endsAt : existing.endsAt,
          completedAt:
            input.completedAt !== undefined
              ? input.completedAt
              : existing.completedAt,
          updatedAt: new Date()
        }
        const nextBody = input.body ?? existing.body

        yield* md.writeGroupFile(
          orgSlug,
          slug,
          id,
          frontmatterToDisk(next),
          nextBody
        )
        return { ...frontmatterToWire(next), body: nextBody }
      })

    const updateTickets = (
      orgSlug: string,
      userId: string,
      slug: string,
      id: string,
      input: UpdateGroupTicketsInput
    ): Effect.Effect<
      GroupDetail,
      NotFound | Conflict | Forbidden | MarkdownError
    > =>
      Effect.gen(function* () {
        yield* projects.requireMember(orgSlug, userId, slug)
        const existing = yield* readGroup(orgSlug, slug, id)
        yield* requireKindRole(orgSlug, userId, slug, existing.kind)
        yield* validateTicketIds(orgSlug, slug, input.tickets)

        const next: GroupFrontmatter = {
          ...existing,
          tickets: input.tickets,
          updatedAt: new Date()
        }
        yield* md.writeGroupFile(
          orgSlug,
          slug,
          id,
          frontmatterToDisk(next),
          existing.body
        )
        return { ...frontmatterToWire(next), body: existing.body }
      })

    const remove = (
      orgSlug: string,
      userId: string,
      slug: string,
      id: string
    ): Effect.Effect<void, NotFound | Forbidden | MarkdownError> =>
      Effect.gen(function* () {
        yield* projects.requireMember(orgSlug, userId, slug)
        const existing = yield* readGroup(orgSlug, slug, id)
        yield* requireKindRole(orgSlug, userId, slug, existing.kind)
        yield* md.removeGroupFile(orgSlug, slug, id)
      })

    const removeTicketFromAllGroups = (
      orgSlug: string,
      slug: string,
      ticketId: string
    ): Effect.Effect<void, MarkdownError> =>
      Effect.gen(function* () {
        const ids = yield* md.listGroupIds(orgSlug, slug)
        for (const id of ids) {
          const g = yield* readGroup(orgSlug, slug, id).pipe(
            Effect.catchTag("NotFound", () => Effect.succeed(null))
          )
          if (g === null) continue
          if (!g.tickets.includes(ticketId as TicketId)) continue
          const next: GroupFrontmatter = {
            ...g,
            tickets: g.tickets.filter((t) => t !== ticketId),
            updatedAt: new Date()
          }
          yield* md.writeGroupFile(
            orgSlug,
            slug,
            id,
            frontmatterToDisk(next),
            g.body
          )
        }
      })

    return {
      list,
      get,
      create,
      update,
      updateTickets,
      remove,
      removeTicketFromAllGroups
    } as const
  })
}) {}
