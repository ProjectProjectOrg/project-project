import * as schema from "@pp/db/schema"
import { member, organization, user } from "@pp/db/schema"
import { and, eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/node-postgres"
import * as Config from "effect/Config"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Redacted from "effect/Redacted"

import {
  BootstrapOrgError,
  type BootstrapOrgInput,
  type BootstrapOrgStore
} from "../../src/bootstrap/org"

const id = () => crypto.randomUUID()

const dbEffect = <A>(try_: () => Promise<A>) =>
  Effect.tryPromise({
    try: try_,
    catch: (cause) => new BootstrapOrgError({ cause })
  })

const requiredString = (name: string) =>
  Effect.gen(function* () {
    const value = yield* Config.String(name)
    const trimmed = value.trim()
    if (!trimmed) {
      return yield* Effect.fail(new Error(`${name} is not set`))
    }
    return trimmed
  })

const optionalString = (name: string) =>
  Effect.gen(function* () {
    const value = yield* Config.String(name).pipe(Config.withDefault(""))
    const trimmed = value.trim()
    return trimmed ? trimmed : null
  })

const databaseUrl = Config.Redacted("DATABASE_URL").pipe(
  Config.map((value) => Redacted.value(value).trim())
)

export const bootstrapInput = Effect.gen(function* () {
  const orgSlug = yield* requiredString("BOOTSTRAP_ORG_SLUG")
  const orgName = yield* requiredString("BOOTSTRAP_ORG_NAME")
  const ownerEmail = yield* requiredString("BOOTSTRAP_OWNER_EMAIL")
  const ownerName = yield* requiredString("BOOTSTRAP_OWNER_NAME")
  const ownerUsername = yield* optionalString("BOOTSTRAP_OWNER_USERNAME")
  const input: BootstrapOrgInput = {
    orgSlug,
    orgName,
    ownerEmail: ownerEmail.toLowerCase(),
    ownerName,
    ownerUsername
  }
  return input
})

const openDb = Effect.gen(function* () {
  const url = yield* databaseUrl
  if (!url) {
    return yield* Effect.fail(new Error("DATABASE_URL is not set"))
  }
  return yield* Effect.acquireRelease(
    Effect.sync(() => drizzle(url, { relations: schema.relations })),
    (db) => Effect.promise(() => db.$client.end())
  )
})

const storeFor = (db: Effect.Success<typeof openDb>) =>
  ({
    findOrgBySlug: (slug) =>
      dbEffect(async () => {
        const rows = await db
          .select({
            id: organization.id,
            slug: organization.slug,
            name: organization.name
          })
          .from(organization)
          .where(eq(organization.slug, slug))
          .limit(1)
        return rows[0] ?? null
      }),
    createOrg: ({ slug, name }) =>
      dbEffect(async () => {
        const rows = await db
          .insert(organization)
          .values({
            id: id(),
            slug,
            name,
            createdAt: new Date()
          })
          .returning({
            id: organization.id,
            slug: organization.slug,
            name: organization.name
          })
        return rows[0]
      }),
    findUserByEmail: (email) =>
      dbEffect(async () => {
        const rows = await db
          .select({
            id: user.id,
            email: user.email,
            name: user.name,
            username: user.username
          })
          .from(user)
          .where(eq(user.email, email))
          .limit(1)
        return rows[0] ?? null
      }),
    createUser: ({ email, name, username }) =>
      dbEffect(async () => {
        const rows = await db
          .insert(user)
          .values({
            id: id(),
            email,
            name,
            username,
            emailVerified: true
          })
          .returning({
            id: user.id,
            email: user.email,
            name: user.name,
            username: user.username
          })
        return rows[0]
      }),
    findMember: ({ organizationId, userId }) =>
      dbEffect(async () => {
        const rows = await db
          .select({
            id: member.id,
            organizationId: member.organizationId,
            userId: member.userId,
            role: member.role
          })
          .from(member)
          .where(
            and(
              eq(member.organizationId, organizationId),
              eq(member.userId, userId)
            )
          )
          .limit(1)
        return rows[0] ?? null
      }),
    createMember: ({ organizationId, userId, role }) =>
      dbEffect(async () => {
        const rows = await db
          .insert(member)
          .values({
            id: id(),
            organizationId,
            userId,
            role,
            createdAt: new Date()
          })
          .returning({
            id: member.id,
            organizationId: member.organizationId,
            userId: member.userId,
            role: member.role
          })
        return rows[0]
      }),
    updateMemberRole: ({ memberId, role }) =>
      dbEffect(() =>
        db.update(member).set({ role }).where(eq(member.id, memberId))
      ).pipe(Effect.asVoid),
    setUserLastActiveOrg: ({ userId, organizationId }) =>
      dbEffect(() =>
        db
          .update(user)
          .set({ lastActiveOrganizationId: organizationId })
          .where(eq(user.id, userId))
      ).pipe(Effect.asVoid)
  }) satisfies BootstrapOrgStore

export class BootstrapStore extends Context.Service<
  BootstrapStore,
  BootstrapOrgStore
>()("@pp/backend/scripts/BootstrapStore") {
  static readonly layer = Layer.effect(
    BootstrapStore,
    Effect.map(openDb, storeFor)
  )
}
