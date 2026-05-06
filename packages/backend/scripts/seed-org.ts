import { drizzle } from "drizzle-orm/node-postgres"
import { asc, eq } from "drizzle-orm"
import { member, organization, user } from "../src/db/schema"

const DEFAULT_SLUG = "dev"
const DEFAULT_NAME = "Dev"

function rid(): string {
  return crypto.randomUUID()
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) throw new Error("DATABASE_URL is not set")

  const slug = process.argv[2] ?? DEFAULT_SLUG
  const name = process.argv[3] ?? DEFAULT_NAME

  const db = drizzle(databaseUrl)

  const existing = await db
    .select({ id: organization.id, slug: organization.slug })
    .from(organization)
    .where(eq(organization.slug, slug))
    .limit(1)
  if (existing[0]) {
    console.log(`org "${slug}" already exists (id=${existing[0].id})`)
    return
  }

  const users = await db
    .select({ id: user.id, email: user.email })
    .from(user)
    .orderBy(asc(user.createdAt))
  if (users.length === 0) {
    throw new Error(
      "no users in db — sign in via the app at least once before seeding."
    )
  }
  const owner = users[0]

  const orgId = rid()
  const now = new Date()
  await db.insert(organization).values({
    id: orgId,
    name,
    slug,
    createdAt: now
  })
  await db.insert(member).values({
    id: rid(),
    organizationId: orgId,
    userId: owner.id,
    role: "owner",
    createdAt: now
  })
  await db
    .update(user)
    .set({ lastActiveOrganizationId: orgId })
    .where(eq(user.id, owner.id))

  console.log(
    `created org slug="${slug}" name="${name}" owner=${owner.email} (id=${orgId}). open /orgs/${slug} to use it.`
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
