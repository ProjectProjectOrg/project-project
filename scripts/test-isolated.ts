import {
  adminPool,
  adminUrl,
  server,
  waitForDatabase
} from "../apps/backend/scripts/agent/database"
import { location } from "../apps/backend/scripts/agent/registry"

const run = (args: ReadonlyArray<string>, env: Record<string, string>) =>
  Bun.spawn([...args], {
    env: { ...process.env, ...env },
    stdio: ["inherit", "inherit", "inherit"]
  }).exited

const { root } = await location()
const { port } = await server(root, true)
const admin = adminPool(port)
await waitForDatabase(admin)

const name = `projectproject_effect_v4_${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}`
const url = adminUrl(port, name)
await admin.query(`create database "${name}"`)

let exitCode = 1
try {
  exitCode = await run(["bun", "run", "test:migrate"], { DATABASE_URL: url })
  if (exitCode === 0)
    exitCode = await run(["bun", "run", "test:all", ...process.argv.slice(2)], {
      PROJECTPROJECT_TEST_DATABASE_URL: url,
      BETTER_AUTH_SECRET: "isolated-effect-v4-oauth-compatibility-test-secret"
    })
} finally {
  await admin.query(`drop database if exists "${name}" with (force)`)
  await admin.end()
}
process.exit(exitCode)
