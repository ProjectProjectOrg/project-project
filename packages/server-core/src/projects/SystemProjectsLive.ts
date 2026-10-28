import { Org } from "@pp/access/roles"
import { Db } from "@pp/db"
import { publishedProject } from "@pp/db/projectVisibility"
import { member, organization, projectIndex } from "@pp/db/schema"
import {
  CreatableProjectKey,
  NotFound,
  OrgScope,
  type OrgScopeShape
} from "@pp/shared"
import { and, asc, eq, isNull } from "drizzle-orm"
import * as Arr from "effect/Array"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as Semaphore from "effect/Semaphore"

import { Bots } from "../bots/Bots"
import { ProjectDocs } from "./ProjectDocs"
import { Projects } from "./Projects"
import {
  SystemProjects,
  type SystemProjectSpec,
  type SystemProjectsShape
} from "./SystemProjects"

const KEY_ATTEMPTS = 9

const decodeKey = Schema.decodeUnknownEffect(CreatableProjectKey)

const keyCandidates = (key: string) => [
  key,
  ...Arr.makeBy(KEY_ATTEMPTS - 1, (n) => `${key}${n + 2}`)
]

export const SystemProjectsLive = Layer.effect(
  SystemProjects,
  Effect.gen(function* () {
    const db = yield* Db
    const bots = yield* Bots
    const projects = yield* Projects
    const projectDocs = yield* ProjectDocs
    const lock = yield* Semaphore.make(1)

    const find = Effect.fn("SystemProjects.find")(function* (
      spec: SystemProjectSpec
    ) {
      const rows = yield* db
        .select({ slug: projectIndex.slug })
        .from(projectIndex)
        .innerJoin(
          organization,
          eq(organization.id, projectIndex.organizationId)
        )
        .where(and(eq(organization.slug, spec.orgSlug), publishedProject()))
        .orderBy(asc(projectIndex.createdAt))
        .pipe(Effect.orDie)
      return yield* Effect.findFirst(rows, ({ slug }) =>
        projectDocs.systemRole(spec.orgSlug, slug).pipe(
          Effect.map((role) => Option.contains(role, spec.role)),
          Effect.catchTag("NotFound", () => Effect.succeed(false))
        )
      ).pipe(Effect.map(Option.map(({ slug }) => slug)))
    })

    const ownerScope = Effect.fn("SystemProjects.ownerScope")(function* (
      orgSlug: string
    ) {
      const [owner] = yield* db
        .select({ userId: member.userId, organizationId: organization.id })
        .from(member)
        .innerJoin(organization, eq(organization.id, member.organizationId))
        .where(
          and(
            eq(organization.slug, orgSlug),
            isNull(organization.deletedAt),
            eq(member.role, "owner")
          )
        )
        .orderBy(asc(member.createdAt))
        .limit(1)
        .pipe(Effect.orDie)
      if (!owner) return yield* new NotFound()
      return {
        userId: owner.userId,
        organizationId: owner.organizationId,
        orgSlug,
        role: "owner",
        deletedAt: null,
        permissions: Org.orgRoles.owner
      } satisfies OrgScopeShape
    })

    const create = Effect.fn("SystemProjects.create")(function* (
      spec: SystemProjectSpec
    ) {
      const scope = yield* ownerScope(spec.orgSlug)
      const keys = yield* Effect.forEach(keyCandidates(spec.key), (key) =>
        decodeKey(key).pipe(Effect.orDie)
      )
      const project = yield* Effect.firstSuccessOf(
        keys.map((key) => projects.create({ name: spec.name, key }))
      ).pipe(Effect.orDie, Effect.provideService(OrgScope, scope))
      yield* projectDocs.markSystem(spec.orgSlug, project.slug, spec.role)
      yield* Effect.logInfo("system project created", {
        role: spec.role,
        orgSlug: spec.orgSlug,
        slug: project.slug
      })
      return project.slug
    })

    const ensure: SystemProjectsShape["ensure"] = Effect.fn(
      "SystemProjects.ensure"
    )(function* (spec) {
      yield* Effect.annotateCurrentSpan({
        role: spec.role,
        orgSlug: spec.orgSlug
      })
      const existing = yield* find(spec)
      const slug = Option.isSome(existing)
        ? existing.value
        : yield* create(spec)
      return yield* bots.projectScope(spec.bot, spec.orgSlug, slug)
    }, lock.withPermits(1))

    return { ensure } satisfies SystemProjectsShape
  })
)
