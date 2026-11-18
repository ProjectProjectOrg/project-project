import { test, expect } from "bun:test"
import { randomBytes } from "node:crypto"
import { mkdir, mkdtemp, realpath, rm, symlink } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import {
  adminPool,
  checkHistory,
  migrateDatabase,
  migrationHistory,
  provision,
  removeDatabase,
  server,
  waitForDatabase
} from "./database"
import { fixtureVersion } from "./fixture"
import {
  AgentRegistry,
  command,
  decodeEnvironment,
  createEnvironmentId,
  type Environment
} from "./registry"
import { childEnvironment } from "./runtime"

const sourceRoot = path.resolve(import.meta.dirname, "../../../..")

async function fixture(
  sql: string,
  verify: (
    input: Readonly<{
      registry: AgentRegistry
      before: Environment["migrations"]
      after: Environment["migrations"]
      failure: string
    }>
  ) => Promise<void>
) {
  const root = await realpath(
    await mkdtemp(path.join(os.tmpdir(), "pp-agent-migration-"))
  )
  const infrastructure = await server(sourceRoot, true)
  const pool = adminPool(infrastructure.port)
  const registry = new AgentRegistry(path.join(root, ".git", "pp-agent"))
  const environment = decodeEnvironment({
    id: createEnvironmentId("test/migration-regression"),
    worktree: root,
    state: "ready",
    migrations: await migrationHistory(sourceRoot),
    fixture: fixtureVersion,
    server: infrastructure.id
  })
  try {
    await command(["git", "init", "--quiet", root], root)
    await mkdir(registry.resources(environment), { recursive: true })
    const secrets = {
      password: randomBytes(32).toString("hex"),
      auth: randomBytes(32).toString("hex"),
      encryption: randomBytes(32).toString("base64"),
      origin: `https://pp-${environment.id}.projectproject.localhost:1355`
    }
    await Bun.write(
      path.join(registry.resources(environment), "secrets.json"),
      JSON.stringify(secrets)
    )
    await registry.save([environment])
    await waitForDatabase(pool)
    await provision(pool, environment, secrets.password)
    const env = childEnvironment(environment, secrets, infrastructure.port)
    await migrateDatabase(sourceRoot, env.DATABASE_URL)
    await symlink(path.join(sourceRoot, "apps"), path.join(root, "apps"))
    const migrations = path.join(root, "packages/db/src/migrations")
    await mkdir(migrations, { recursive: true })
    for (const migration of environment.migrations) {
      const destination = path.join(migrations, migration.name)
      await mkdir(destination)
      await Bun.write(
        path.join(destination, "migration.sql"),
        await Bun.file(
          path.join(
            sourceRoot,
            "packages/db/src/migrations",
            migration.name,
            "migration.sql"
          )
        ).text()
      )
    }
    const appended = path.join(migrations, "20990101000000_regression")
    await mkdir(appended)
    await Bun.write(path.join(appended, "migration.sql"), sql)
    const child = Bun.spawn(
      [
        process.execPath,
        "--no-env-file",
        path.join(sourceRoot, "apps/backend/scripts/dev-agent.ts"),
        "serve"
      ],
      {
        cwd: root,
        env: { ...env, PORTLESS_URL: secrets.origin, PORT: "invalid" },
        stdout: "pipe",
        stderr: "pipe"
      }
    )
    const [code, output, errors] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text()
    ])
    expect(code).not.toBe(0)
    await verify({
      registry,
      before: environment.migrations,
      after: await migrationHistory(root),
      failure: output + errors
    })
  } finally {
    try {
      await removeDatabase(pool, environment)
    } finally {
      await pool.end()
      await rm(root, { recursive: true, force: true })
    }
  }
}

test("server startup failure preserves the newly applied migration history", async () => {
  await fixture(
    "CREATE TABLE agent_migration_regression (id integer);",
    async ({ registry, before, after, failure }) => {
      expect(failure).toContain("Portless assigns the frontend port")
      const [environment] = await registry.read()
      expect(environment.migrations).toEqual(after)
      expect(() => checkHistory(environment.migrations, before)).toThrow(
        "Migration history diverged"
      )
    }
  )
}, 60_000)

test("failed migrations leave the environment blocked for explicit recovery", async () => {
  await fixture(
    "SELECT agent_intentionally_missing_function();",
    async ({ registry, before, failure }) => {
      expect(failure).toContain("agent_intentionally_missing_function")
      const [environment] = await registry.read()
      expect(environment.state).toBe("provisioning")
      expect(environment.migrations).toEqual(before)
    }
  )
}, 60_000)
