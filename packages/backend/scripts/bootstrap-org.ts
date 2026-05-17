import { drizzle } from "drizzle-orm/node-postgres"
import { and, eq } from "drizzle-orm"
import * as Config from "effect/Config"
import * as Console from "effect/Console"
import * as Effect from "effect/Effect"
import * as Redacted from "effect/Redacted"
import {
  BootstrapOrgError,
  bootstrapOrg,
  type BootstrapOrgStore
} from "../src/bootstrap/org"
import * as schema from "../src/db/schema"
import { member, organization, user } from "../src/db/schema"

function id(): string {
  return crypto.randomUUID()
}

const dbEffect = <A>(try_: () => Promise<A>) =>
  Effect.tryPromise({
    try: try_,
    catch: (cause) => new BootstrapOrgError({ cause })
  })

const requiredString = (name: string) =>
  Effect.gen(function* () {
    const value = yield* Config.string(name)
    const trimmed = value.trim()
    if (!trimmed) {
      return yield* Effect.fail(new Error(`${name} is not set`))
    }
    return trimmed
  })

const optionalString = (name: string) =>
  Effect.gen(function* () {
    const value = yield* Config.string(name).pipe(Config.withDefault(""))
    const trimmed = value.trim()
    return trimmed ? trimmed : null
  })

const bootstrapConfig = Effect.gen(function* () {
  const databaseUrl = yield* Config.redacted("DATABASE_URL").pipe(
    Effect.map(Redacted.value),
    Effect.map((value) => value.trim()),
    Effect.filterOrFail(
      (value) => value.length > 0,
      () => new Error("DATABASE_URL is not set")
    )
  )
  const orgSlug = yield* requiredString("BOOTSTRAP_ORG_SLUG")
  const orgName = yield* requiredString("BOOTSTRAP_ORG_NAME")
  const ownerEmail = yield* requiredString("BOOTSTRAP_OWNER_EMAIL")
  const ownerName = yield* requiredString("BOOTSTRAP_OWNER_NAME")
  const ownerUsername = yield* optionalString("BOOTSTRAP_OWNER_USERNAME")

  return {
    databaseUrl,
    input: {
      orgSlug,
      orgName,
      ownerEmail: ownerEmail.toLowerCase(),
      ownerName,
      ownerUsername
    }
  }
})

const main = Effect.gen(function* () {
  const { databaseUrl, input } = yield* bootstrapConfig
  const db = drizzle(databaseUrl, { schema })
  const store: BootstrapOrgStore = {
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
  }

  const result = yield* bootstrapOrg(store, input)

  yield* Console.log(
    `[bootstrap-org] org ${state(result.created.org)}: ${result.org.slug}`
  )
  yield* Console.log(
    `[bootstrap-org] owner ${state(result.created.owner)}: ${result.owner.email}`
  )
  yield* Console.log(
    `[bootstrap-org] membership ${state(result.created.membership)}: ${result.membership.role}`
  )
})

function state(created: boolean): string {
  return created ? "created" : "existing"
}

Effect.runPromise(main).catch((error) => {
  console.error(error)
  process.exit(1)
})
