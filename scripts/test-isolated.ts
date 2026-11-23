import { mkdtemp, readdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

import * as Schema from "effect/Schema"

import {
  adminPool,
  adminUrl,
  migrateDatabase,
  pool,
  server,
  waitForDatabase
} from "../apps/backend/scripts/agent/database"
import { location } from "../apps/backend/scripts/agent/registry"

const Timings = Schema.Struct({
  version: Schema.Literal(1),
  files: Schema.Record(Schema.String, Schema.Number)
})
const decodeTimings = Schema.decodeUnknownSync(Timings)
const encodeTimings = (files: Record<string, number>) =>
  JSON.stringify({ version: 1, files } satisfies typeof Timings.Type)

const { root } = await location()
const workers = navigator.hardwareConcurrency
const ciAdmin = process.env.PROJECTPROJECT_TEST_ADMIN_URL

const args = process.argv.slice(2)
const shardArg = args.find((arg) => arg.startsWith("--shard="))
const forwarded = args.filter((arg) => arg !== shardArg)
const explicit = forwarded.some((arg) => !arg.startsWith("-"))

const testFiles =
  // .github/scripts tests run in the changeset workflow; bunfig skips dot folders.
  (
    await Bun.$`git ls-files -- '*.test.ts' '*.test.tsx' ':!.github/**'`
      .cwd(root)
      .text()
  )
    .split("\n")
    .filter(Boolean)

const timingsDir = path.join(root, ".cache/test-timings")
const recorded: Record<string, number> = {}
for (const file of await readdir(timingsDir).catch(() => []))
  Object.assign(
    recorded,
    decodeTimings(await Bun.file(path.join(timingsDir, file)).json()).files
  )

const plan = (files: ReadonlyArray<string>, count: number) => {
  const known = Object.values(recorded).toSorted((a, b) => a - b)
  const fallback = known[Math.floor(known.length / 2)] ?? 1
  const time = (file: string) => recorded[file] ?? fallback
  const shards = Array.from({ length: count }, () => ({
    total: 0,
    files: new Array<string>()
  }))
  for (const file of files.toSorted(
    (a, b) => time(b) - time(a) || a.localeCompare(b)
  )) {
    const lightest = shards.reduce((min, shard) =>
      shard.total < min.total ? shard : min
    )
    lightest.files.push(file)
    lightest.total += time(file)
  }
  return shards
}

const shardFiles = () => {
  const match = shardArg?.match(/^--shard=(\d+)\/(\d+)$/)
  if (!match)
    throw new Error(`Expected --shard=<index>/<count>, got ${shardArg}`)
  const [index, count] = [Number(match[1]), Number(match[2])]
  if (index < 1 || index > count)
    throw new Error(`Shard ${index} is outside 1..${count}`)
  const shards = plan(testFiles, count)
  const fingerprint = new Bun.CryptoHasher("sha256")
    .update(JSON.stringify(shards.map((shard) => shard.files)))
    .digest("hex")
    .slice(0, 12)
  console.log(
    `Shard plan ${fingerprint}: ${testFiles.length} files, ${Object.keys(recorded).length} timed, estimated ${shards.map((shard) => `${Math.round(shard.total / 1000)}s`).join(" / ")}`
  )
  return shards[index - 1].files
}

const selected = shardArg ? shardFiles() : explicit ? [] : testFiles

const databaseUrl = ciAdmin
  ? (database: string) =>
      Object.assign(new URL(ciAdmin), { pathname: `/${database}` }).toString()
  : await server(root, true).then(
      ({ port }) =>
        (database: string) =>
          adminUrl(port, database)
    )
const admin = ciAdmin
  ? pool(ciAdmin)
  : adminPool(new URL(databaseUrl("postgres")).port)
await waitForDatabase(admin)

const name = `projectproject_effect_v4_${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}`
const names = [
  name,
  ...Array.from({ length: workers }, (_, i) => `${name}_w${i + 1}`)
]
const scratch = await mkdtemp(path.join(tmpdir(), "pp-test-"))
const list = path.join(scratch, "files.txt")
const junit = path.join(scratch, "junit.xml")
const timings = path.join(scratch, "timings.json")
await Bun.write(list, selected.join("\n"))
await Bun.write(timings, encodeTimings(recorded))

let exitCode = 1
try {
  await admin.query(`create database "${name}"`)
  await migrateDatabase(root, databaseUrl(name))
  for (const copy of names.slice(1))
    await admin.query(`create database "${copy}" template "${name}"`)
  exitCode = await Bun.spawn(
    [
      process.execPath,
      "test",
      "--isolate",
      `--parallel=${workers}`,
      "--randomize",
      "--reporter=junit",
      `--reporter-outfile=${junit}`,
      ...(Object.keys(recorded).length > 0 ? [`--timings=${timings}`] : []),
      ...(explicit ? [] : [`--files-from=${list}`]),
      ...forwarded
    ],
    {
      cwd: root,
      env: {
        ...process.env,
        PROJECTPROJECT_TEST_DATABASE_URL: databaseUrl(name),
        BETTER_AUTH_SECRET: "isolated-effect-v4-oauth-compatibility-test-secret"
      },
      stdio: ["inherit", "inherit", "inherit"]
    }
  ).exited

  if (!explicit) {
    const report = await Bun.file(junit)
      .text()
      .catch(() => "")
    const ran = new Map<string, number>()
    for (const [, suite, file, seconds] of report.matchAll(
      /<testsuite name="([^"]+)" file="([^"]+)"[^>]*?\btime="([0-9.]+)"/g
    ))
      if (suite === file) ran.set(file, Math.round(Number(seconds) * 1000))
    const missing = selected.filter((file) => !ran.has(file))
    const unexpected = [...ran.keys()].filter(
      (file) => !selected.includes(file)
    )
    if (missing.length > 0 || unexpected.length > 0) {
      console.error(
        `Ran ${ran.size} of ${selected.length} assigned test files.`,
        ...missing.map((file) => `\n  not run: ${file}`),
        ...unexpected.map((file) => `\n  not assigned: ${file}`)
      )
      exitCode = 1
    }
    await Bun.write(
      path.join(root, ".cache/test-timings-measured.json"),
      encodeTimings(Object.fromEntries(ran))
    )
  }
} finally {
  for (const database of names)
    await admin.query(`drop database if exists "${database}" with (force)`)
  await admin.end()
  await rm(scratch, { recursive: true, force: true })
}
process.exit(exitCode)
