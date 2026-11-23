import { execFileSync } from "node:child_process"
import { existsSync, statSync } from "node:fs"
import { fileURLToPath } from "node:url"

const MAX_BYTES = 3 * 1024 * 1024
const THEMES = ["light", "dark"] as const
const args = process.argv.slice(2)
const force = args.includes("--force")
const id = args.find((arg) => arg !== "--force")
if (id === undefined || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) {
  console.error(
    "Usage: bun run render <composition-id> [--force]  (kebab-case)"
  )
  process.exit(1)
}

const root = fileURLToPath(new URL("..", import.meta.url))

// One file per theme: <id>.light.mp4 and <id>.dark.mp4.
const outputs = THEMES.map((theme) => ({
  theme,
  out: fileURLToPath(
    new URL(`../../../.changeset/media/${id}.${theme}.mp4`, import.meta.url)
  )
}))

const existing = outputs.filter(({ out }) => existsSync(out))
if (existing.length > 0 && !force) {
  console.error(
    `${existing.map(({ out }) => out).join(" and ")} already ${existing.length === 1 ? "exists" : "exist"}. A shipped video is history: pick a new name, or pass --force to replace an unreleased one.`
  )
  process.exit(1)
}

for (const { theme, out } of outputs) {
  execFileSync(
    "bunx",
    [
      "remotion",
      "render",
      "src/index.ts",
      id,
      out,
      `--props=${JSON.stringify({ theme })}`
    ],
    { cwd: root, stdio: "inherit" }
  )
  const size = statSync(out).size
  console.log(`${out}: ${(size / 1024 / 1024).toFixed(2)} MB`)
  if (size > MAX_BYTES) {
    console.error("Over 3 MB: shorten the composition or raise --crf.")
    process.exit(1)
  }
}
