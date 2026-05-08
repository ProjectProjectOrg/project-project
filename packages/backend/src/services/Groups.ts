import { Effect, Schema } from "effect"
import {
  ADMIN_GATED_KINDS,
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
  UpdateGroupTicketsInput,
  Validation
} from "@projectproject/shared"
import { Markdown, type MarkdownError } from "./Markdown"
import { Projects } from "./Projects"

const MAX_CREATE_ATTEMPTS = 16

const GroupFrontmatter = Schema.Struct({
  ...Group.fields,
  kind: Schema.optionalWith(GroupKind, { default: () => "other" as const }),
  tickets: Schema.optionalWith(Schema.Array(TicketId), { default: () => [] }),
  startsAt: Schema.optionalWith(Schema.NullOr(Schema.Date), {
    default: () => null
  }),
  endsAt: Schema.optionalWith(Schema.NullOr(Schema.Date), {
    default: () => null
  }),
  completedAt: Schema.optionalWith(Schema.NullOr(Schema.Date), {
    default: () => null
  })
})

const decodeFrontmatter = Schema.decodeUnknown(GroupFrontmatter)

function nextIdFrom(ids: ReadonlyArray<string>): string {
  let max = 0
  for (const id of ids) {
    const n = Number(id.slice(2))
    if (Number.isFinite(n) && n > max) max = n
  }
  return `G-${max + 1}`
}

function pickColor(used: ReadonlyArray<string>): GroupColor {
  for (const c of TAG_DEFAULT_PALETTE)
    if (!used.includes(c)) return c as GroupColor
  return TAG_DEFAULT_PALETTE[
    used.length % TAG_DEFAULT_PALETTE.length
  ] as GroupColor
}

function frontmatterToDisk(fm: Group): Record<string, unknown> {
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
      { group: Group; body: string },
      NotFound | MarkdownError
    > =>
      Effect.gen(function* () {
        const file = yield* md.readGroupFile(orgSlug, slug, id)
        const group = yield* decodeFrontmatter(file.data).pipe(Effect.orDie)
        return { group, body: file.body }
      })

    const validateTicketIds = (
      orgSlug: string,
      slug: string,
      ticketIds: ReadonlyArray<string>
    ): Effect.Effect<void, NotFound | MarkdownError> =>
      Effect.gen(function* () {
        if (ticketIds.length === 0) return
        const existing = yield* md.listTicketIds(orgSlug, slug)
        const set = new Set(existing)
        for (const id of ticketIds) {
          if (!set.has(id)) {
            return yield* Effect.fail(new NotFound())
          }
        }
      })

    const validateInterval = (
      startsAt: Date | null,
      endsAt: Date | null
    ): Effect.Effect<void, Validation> =>
      startsAt !== null && endsAt !== null && endsAt < startsAt
        ? Effect.fail(new Validation({ reason: "invalid_interval" }))
        : Effect.void

    const validateCompletion = (
      completedAt: Date | null,
      startsAt: Date | null,
      now: Date
    ): Effect.Effect<void, Validation> => {
      if (completedAt === null) return Effect.void
      if (completedAt > now) {
        return Effect.fail(new Validation({ reason: "completed_in_future" }))
      }
      if (startsAt !== null && completedAt < startsAt) {
        return Effect.fail(
          new Validation({ reason: "completed_before_start" })
        )
      }
      return Effect.void
    }

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
        const results = yield* Effect.forEach(
          ids,
          (id) => readGroup(orgSlug, slug, id),
          { concurrency: 8 }
        )
        return [...results.map((r) => r.group)].sort(
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
        const { group, body } = yield* readGroup(orgSlug, slug, id)
        return { ...group, body }
      })

    const create = (
      orgSlug: string,
      userId: string,
      slug: string,
      input: CreateGroupInput
    ): Effect.Effect<
      Group,
      NotFound | Forbidden | Validation | MarkdownError
    > =>
      Effect.gen(function* () {
        const kind: GroupKind = input.kind ?? "other"
        yield* requireKindRole(orgSlug, userId, slug, kind)

        const requestedTickets = input.tickets ?? []
        yield* validateTicketIds(orgSlug, slug, requestedTickets)
        yield* validateInterval(input.startsAt ?? null, input.endsAt ?? null)

        const ids = yield* md.listGroupIds(orgSlug, slug)
        let candidate = nextIdFrom(ids)

        const color = yield* input.color !== undefined
          ? Effect.succeed(input.color)
          : Effect.forEach(ids, (id) => readGroup(orgSlug, slug, id), {
              concurrency: 8
            }).pipe(Effect.map((rs) => pickColor(rs.map((r) => r.group.color))))

        const now = new Date()
        const fm: Group = {
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
          const next: Group = { ...fm, id: candidate as GroupId }
          const result = yield* md
            .createGroupFile(
              orgSlug,
              slug,
              candidate,
              frontmatterToDisk(next),
              `# ${input.name}\n`
            )
            .pipe(
              Effect.map(() => "ok" as const),
              Effect.catchTag("GroupIdTaken", () =>
                Effect.succeed("retry" as const)
              )
            )
          if (result === "ok") {
            return next
          }
          const freshIds = yield* md.listGroupIds(orgSlug, slug)
          candidate = nextIdFrom(freshIds)
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
    ): Effect.Effect<
      GroupDetail,
      NotFound | Forbidden | Validation | MarkdownError
    > =>
      Effect.gen(function* () {
        yield* projects.get(orgSlug, userId, slug)

        const { group: existing, body: existingBody } = yield* readGroup(
          orgSlug,
          slug,
          id
        )
        yield* requireKindRole(orgSlug, userId, slug, existing.kind)

        const now = new Date()
        const next: Group = {
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
          updatedAt: now
        }
        yield* validateInterval(next.startsAt, next.endsAt)
        yield* validateCompletion(next.completedAt, next.startsAt, now)
        const nextBody = input.body ?? existingBody

        yield* md.writeGroupFile(
          orgSlug,
          slug,
          id,
          frontmatterToDisk(next),
          nextBody
        )
        return { ...next, body: nextBody }
      })

    const updateTickets = (
      orgSlug: string,
      userId: string,
      slug: string,
      id: string,
      input: UpdateGroupTicketsInput
    ): Effect.Effect<
      GroupDetail,
      NotFound | Forbidden | MarkdownError
    > =>
      Effect.gen(function* () {
        yield* projects.requireMember(orgSlug, userId, slug)
        const { group: existing, body: existingBody } = yield* readGroup(
          orgSlug,
          slug,
          id
        )
        yield* requireKindRole(orgSlug, userId, slug, existing.kind)
        yield* validateTicketIds(orgSlug, slug, input.tickets)

        const next: Group = {
          ...existing,
          tickets: input.tickets,
          updatedAt: new Date()
        }
        yield* md.writeGroupFile(
          orgSlug,
          slug,
          id,
          frontmatterToDisk(next),
          existingBody
        )
        return { ...next, body: existingBody }
      })

    const remove = (
      orgSlug: string,
      userId: string,
      slug: string,
      id: string
    ): Effect.Effect<void, NotFound | Forbidden | MarkdownError> =>
      Effect.gen(function* () {
        yield* projects.requireMember(orgSlug, userId, slug)
        const { group: existing } = yield* readGroup(orgSlug, slug, id)
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
        yield* Effect.forEach(
          ids,
          (id) =>
            Effect.gen(function* () {
              const result = yield* readGroup(orgSlug, slug, id).pipe(
                Effect.catchTag("NotFound", () => Effect.succeed(null))
              )
              if (result === null) return
              const { group, body } = result
              if (!group.tickets.includes(ticketId as TicketId)) return
              const next: Group = {
                ...group,
                tickets: group.tickets.filter((t) => t !== ticketId),
                updatedAt: new Date()
              }
              yield* md
                .writeGroupFileIfExists(
                  orgSlug,
                  slug,
                  id,
                  frontmatterToDisk(next),
                  body
                )
                .pipe(Effect.catchTag("NotFound", () => Effect.void))
            }),
          { concurrency: 8 }
        )
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
