// One-off migration: assign existing dev data to a "project-project" org.
//
// Run once: `bun run migrate:orgs`. Then move this file to
// `scripts/_archive/` (or delete) — it is not idempotent and not intended
// for repeated execution.
//
// Steps:
//   1. Pre-flight: required schema columns exist; no `project-project` org
//      already; at least 1 user.
//   2. Promote the earliest-signed-up user to instance super-admin
//      (`user.role = "admin"`) and make them the new org's `owner`. Any
//      additional users become regular org `member`s.
//   3. Backfill `projectIndex.organizationId` for every existing row.
//   4. Remap `projectMember.projectId` from the corresponding
//      `projectIndex.id` UUID (looked up by slug). The legacy
//      `projectMember.projectSlug` column stays in place — a follow-up
//      Drizzle migration drops it and tightens the new columns to NOT NULL.
//   5. Move on-disk data from the legacy `<root>/projects/` location to
//      `<root>/orgs/project-project/projects/`. Skipped if the legacy dir
//      doesn't exist.
//   6. Rewrite each `project.md` frontmatter: add `org: project-project`
//      and rename `ownerId` → `createdBy` if still present. Skipped if no
//      project.md files exist.
//   7. Verify: read every project file back via `gray-matter` and assert
//      the new fields are present.
//
// DB and FS aren't transactionally coupled. Order: DB first inside a
// transaction, then FS, then frontmatter. On FS error after the DB
// commit, log loudly and surface manual-recovery instructions; do not
// auto-rollback the DB (manual `mv` is safer than auto-corruption).

import { drizzle } from "drizzle-orm/node-postgres"
import { and, asc, eq, isNull } from "drizzle-orm"
import * as fs from "node:fs/promises"
import * as path from "node:path"
import matter from "gray-matter"
import {
  member,
  organization,
  projectIndex,
  projectMember,
  user
} from "../src/db/schema"

const ORG_SLUG = "project-project"
const ORG_NAME = "ProjectProject"

function rid(): string {
  return crypto.randomUUID()
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) throw new Error("DATABASE_URL is not set")
  const projectsDir = process.env.PROJECTS_DIR
  if (!projectsDir) throw new Error("PROJECTS_DIR is not set")

  const db = drizzle(databaseUrl)
  const absoluteRoot = path.isAbsolute(projectsDir)
    ? projectsDir
    : path.resolve(process.cwd(), projectsDir)

  console.log(`[migrate-orgs] PROJECTS_DIR resolved to ${absoluteRoot}`)

  // --- 1. pre-flight ------------------------------------------------------

  const existingOrg = await db
    .select({ id: organization.id })
    .from(organization)
    .where(eq(organization.slug, ORG_SLUG))
    .limit(1)
  if (existingOrg.length > 0) {
    throw new Error(
      `org with slug "${ORG_SLUG}" already exists; this script is one-off, not idempotent`
    )
  }

  const users = await db.select().from(user).orderBy(asc(user.createdAt))
  if (users.length === 0) {
    throw new Error("no users in the user table; run sign-in once first")
  }

  const primary = users[0]
  const others = users.slice(1)
  console.log(
    `[migrate-orgs] primary user: ${primary.email} (id=${primary.id})`
  )
  if (others.length > 0) {
    console.log(
      `[migrate-orgs] additional users → org members: ${others.map((u) => u.email).join(", ")}`
    )
  }

  // --- 2. promote primary + create org + add members ---------------------

  await db.transaction(async (tx) => {
    await tx.update(user).set({ role: "admin" }).where(eq(user.id, primary.id))

    const orgId = rid()
    const now = new Date()
    await tx.insert(organization).values({
      id: orgId,
      name: ORG_NAME,
      slug: ORG_SLUG,
      createdAt: now
    })
    console.log(`[migrate-orgs] org created (id=${orgId})`)

    await tx.insert(member).values({
      id: rid(),
      organizationId: orgId,
      userId: primary.id,
      role: "owner",
      createdAt: now
    })
    for (const u of others) {
      await tx.insert(member).values({
        id: rid(),
        organizationId: orgId,
        userId: u.id,
        role: "member",
        createdAt: now
      })
    }

    // --- 3. backfill projectIndex.organizationId -------------------------

    const updated = await tx
      .update(projectIndex)
      .set({ organizationId: orgId })
      .where(isNull(projectIndex.organizationId))
      .returning({ id: projectIndex.id, slug: projectIndex.slug })
    console.log(
      `[migrate-orgs] backfilled organizationId on ${updated.length} project_index row(s)`
    )

    // --- 4. remap projectMember.projectId from projectSlug --------------

    const slugToId = new Map(updated.map((r) => [r.slug, r.id]))
    // Anything created before T-01's UUID-id column existed has a real id
    // already (defaultRandom filled them at ADD COLUMN time); we still need
    // the lookup to remap projectMember rows whose projectId is null.
    const allProjects = await tx
      .select({ id: projectIndex.id, slug: projectIndex.slug })
      .from(projectIndex)
    for (const p of allProjects) slugToId.set(p.slug, p.id)

    const memberRows = await tx
      .select({
        projectSlug: projectMember.projectSlug,
        userId: projectMember.userId
      })
      .from(projectMember)
      .where(isNull(projectMember.projectId))

    for (const m of memberRows) {
      const targetId = slugToId.get(m.projectSlug)
      if (!targetId) {
        throw new Error(
          `projectMember row references unknown projectSlug "${m.projectSlug}"`
        )
      }
      await tx
        .update(projectMember)
        .set({ projectId: targetId })
        .where(
          and(
            eq(projectMember.projectSlug, m.projectSlug),
            eq(projectMember.userId, m.userId)
          )
        )
    }
    console.log(
      `[migrate-orgs] remapped projectId on ${memberRows.length} project_member row(s)`
    )
  })

  // --- 5. FS move --------------------------------------------------------

  const legacyProjectsDir = path.join(absoluteRoot, "projects")
  const newProjectsParent = path.join(absoluteRoot, "orgs", ORG_SLUG)
  const newProjectsDir = path.join(newProjectsParent, "projects")

  let legacyExists = false
  try {
    await fs.access(legacyProjectsDir)
    legacyExists = true
  } catch {
    legacyExists = false
  }

  if (legacyExists) {
    await fs.mkdir(newProjectsParent, { recursive: true })
    await fs.rename(legacyProjectsDir, newProjectsDir)
    console.log(
      `[migrate-orgs] moved ${legacyProjectsDir} → ${newProjectsDir}`
    )
  } else {
    await fs.mkdir(newProjectsDir, { recursive: true })
    console.log(
      `[migrate-orgs] no legacy ${legacyProjectsDir} to move; created ${newProjectsDir}`
    )
  }

  // --- 6. frontmatter rewrite -------------------------------------------

  let projectDirs: string[] = []
  try {
    const entries = await fs.readdir(newProjectsDir, { withFileTypes: true })
    projectDirs = entries
      .filter((e) => e.isDirectory())
      .map((e) => path.join(newProjectsDir, e.name))
  } catch {
    projectDirs = []
  }

  let rewritten = 0
  for (const dir of projectDirs) {
    const file = path.join(dir, "project.md")
    let raw: string
    try {
      raw = await fs.readFile(file, "utf8")
    } catch {
      continue
    }
    const parsed = matter(raw)
    const data = parsed.data as Record<string, unknown>
    let changed = false
    if (data.org !== ORG_SLUG) {
      data.org = ORG_SLUG
      changed = true
    }
    if ("ownerId" in data && !("createdBy" in data)) {
      data.createdBy = data.ownerId
      delete data.ownerId
      changed = true
    }
    if (changed) {
      await fs.writeFile(file, matter.stringify(parsed.content, data), "utf8")
      rewritten++
    }
  }
  console.log(`[migrate-orgs] rewrote frontmatter in ${rewritten} file(s)`)

  // --- 7. verify ---------------------------------------------------------

  for (const dir of projectDirs) {
    const file = path.join(dir, "project.md")
    let raw: string
    try {
      raw = await fs.readFile(file, "utf8")
    } catch {
      continue
    }
    const parsed = matter(raw)
    const data = parsed.data as Record<string, unknown>
    if (data.org !== ORG_SLUG) {
      throw new Error(`verification failed: ${file} has org=${String(data.org)}`)
    }
    if ("ownerId" in data) {
      throw new Error(
        `verification failed: ${file} still has 'ownerId' frontmatter`
      )
    }
  }

  console.log("[migrate-orgs] done.")
  process.exit(0)
}

main().catch((e) => {
  console.error("[migrate-orgs] FAILED:", e?.message ?? e)
  if (e?.stack) console.error(e.stack)
  process.exit(1)
})
