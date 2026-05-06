// One-off migration: relocate on-disk project data into the orgs layout.
//
// Run on the server: `bun run migrate:relayout`. Not idempotent for the
// frontmatter rewrite portion (re-runs are harmless once layout is in place
// — moves are no-ops, frontmatter rewrites short-circuit when fields are
// already present).
//
// Env:
//   PROJECTS_DIR         destination data root, e.g. /data
//                        Final layout: <PROJECTS_DIR>/orgs/<ORG_SLUG>/projects/<slug>/
//   LEGACY_PROJECTS_DIR  where project-slug folders currently live, e.g.
//                        /data/projects. Defaults to <PROJECTS_DIR>/projects.
//                        Set equal to PROJECTS_DIR if project dirs sit at
//                        the root.
//   ORG_SLUG             defaults to "project-project".
//
// What it does:
//   1. Enumerates immediate subdirs of LEGACY_PROJECTS_DIR.
//   2. For each subdir that contains a project.md, moves it to
//      <PROJECTS_DIR>/orgs/<ORG_SLUG>/projects/<slug>/.
//   3. Rewrites project.md frontmatter: ensure `org: <ORG_SLUG>` is set,
//      rename `ownerId` → `createdBy` if present.
//   4. Verifies every moved project.md has the expected fields.
//   5. Best-effort cleanup: removes empty directories left behind under
//      LEGACY_PROJECTS_DIR (including any prior empty `orgs/...` debris).
//
// DB is NOT touched — assume migrate-orgs.ts has already run successfully
// for the DB side (org row, members, projectIndex.organizationId,
// projectMember.projectId remap).

import * as fs from "node:fs/promises"
import * as path from "node:path"
import matter from "gray-matter"

async function dirExists(p: string): Promise<boolean> {
  try {
    const s = await fs.stat(p)
    return s.isDirectory()
  } catch {
    return false
  }
}

async function fileExists(p: string): Promise<boolean> {
  try {
    const s = await fs.stat(p)
    return s.isFile()
  } catch {
    return false
  }
}

async function main() {
  const projectsDir = process.env.PROJECTS_DIR
  if (!projectsDir) throw new Error("PROJECTS_DIR is not set")
  const orgSlug = process.env.ORG_SLUG ?? "project-project"

  const root = path.isAbsolute(projectsDir)
    ? projectsDir
    : path.resolve(process.cwd(), projectsDir)

  const legacyEnv = process.env.LEGACY_PROJECTS_DIR
  const legacyRoot = legacyEnv
    ? path.isAbsolute(legacyEnv)
      ? legacyEnv
      : path.resolve(process.cwd(), legacyEnv)
    : path.join(root, "projects")

  const targetParent = path.join(root, "orgs", orgSlug, "projects")

  console.log(`[relayout] PROJECTS_DIR     = ${root}`)
  console.log(`[relayout] LEGACY_PROJECTS  = ${legacyRoot}`)
  console.log(`[relayout] ORG_SLUG         = ${orgSlug}`)
  console.log(`[relayout] target parent    = ${targetParent}`)

  if (!(await dirExists(legacyRoot))) {
    console.log(
      `[relayout] legacy dir does not exist; nothing to move. Will still run frontmatter pass on ${targetParent}.`
    )
  }

  await fs.mkdir(targetParent, { recursive: true })

  const candidates = (await dirExists(legacyRoot))
    ? await fs.readdir(legacyRoot, { withFileTypes: true })
    : []

  const moved: string[] = []
  const skipped: string[] = []
  for (const entry of candidates) {
    if (!entry.isDirectory()) continue
    if (entry.name === "orgs") {
      skipped.push(`${entry.name} (debris dir, will clean up later)`)
      continue
    }
    const src = path.join(legacyRoot, entry.name)
    const projectMd = path.join(src, "project.md")
    if (!(await fileExists(projectMd))) {
      skipped.push(`${entry.name} (no project.md)`)
      continue
    }
    const dst = path.join(targetParent, entry.name)
    if (await dirExists(dst)) {
      throw new Error(
        `destination already exists: ${dst}. Refusing to overwrite.`
      )
    }
    await fs.rename(src, dst)
    moved.push(entry.name)
    console.log(`[relayout] moved ${src} → ${dst}`)
  }
  console.log(
    `[relayout] moved ${moved.length} project dir(s); skipped ${skipped.length}`
  )
  for (const s of skipped) console.log(`[relayout]   skip: ${s}`)

  // --- frontmatter rewrite over everything currently in targetParent -----

  const targetEntries = await fs.readdir(targetParent, { withFileTypes: true })
  let rewritten = 0
  let unchanged = 0
  for (const entry of targetEntries) {
    if (!entry.isDirectory()) continue
    const file = path.join(targetParent, entry.name, "project.md")
    if (!(await fileExists(file))) continue
    const raw = await fs.readFile(file, "utf8")
    const parsed = matter(raw)
    const data = parsed.data as Record<string, unknown>
    let changed = false
    if (data.org !== orgSlug) {
      data.org = orgSlug
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
    } else {
      unchanged++
    }
  }
  console.log(
    `[relayout] frontmatter: ${rewritten} rewritten, ${unchanged} already current`
  )

  // --- verify ------------------------------------------------------------

  for (const entry of targetEntries) {
    if (!entry.isDirectory()) continue
    const file = path.join(targetParent, entry.name, "project.md")
    if (!(await fileExists(file))) continue
    const parsed = matter(await fs.readFile(file, "utf8"))
    const data = parsed.data as Record<string, unknown>
    if (data.org !== orgSlug) {
      throw new Error(
        `verify failed: ${file} has org=${String(data.org)}`
      )
    }
    if ("ownerId" in data) {
      throw new Error(`verify failed: ${file} still has 'ownerId'`)
    }
    if (!("createdBy" in data)) {
      throw new Error(`verify failed: ${file} missing 'createdBy'`)
    }
  }

  // --- cleanup empty legacy dirs ----------------------------------------

  if (await dirExists(legacyRoot)) {
    await pruneEmptyDirs(legacyRoot, root)
  }

  console.log("[relayout] done.")
  process.exit(0)
}

async function pruneEmptyDirs(dir: string, stopAt: string): Promise<void> {
  if (path.resolve(dir) === path.resolve(stopAt)) return
  let entries: import("node:fs").Dirent[]
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const e of entries) {
    if (e.isDirectory()) {
      await pruneEmptyDirs(path.join(dir, e.name), stopAt)
    }
  }
  try {
    const remaining = await fs.readdir(dir)
    if (remaining.length === 0) {
      await fs.rmdir(dir)
      console.log(`[relayout] removed empty dir ${dir}`)
    }
  } catch {}
}

main().catch((e) => {
  console.error("[relayout] FAILED:", e?.message ?? e)
  if (e?.stack) console.error(e.stack)
  process.exit(1)
})
