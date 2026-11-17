import { randomBytes } from "node:crypto"
import { lstat, mkdir, realpath, rm, stat } from "node:fs/promises"
import path from "node:path"

import * as Schema from "effect/Schema"

import {
  adminPool,
  checkHistory,
  migrateDatabase,
  migrationHistory,
  provision,
  removeDatabase,
  server,
  verifyOwnership,
  waitForDatabase
} from "./agent/database"
import { fixtureVersion } from "./agent/fixture"
import {
  AgentRegistry,
  Environment,
  decodeRunning,
  decodeEnvironment,
  command,
  exists,
  isRunning,
  processIdentity,
  location,
  readJson,
  writeJson
} from "./agent/registry"
import {
  decodeSecrets,
  type Secrets,
  childEnvironment,
  loginUrl,
  prepareFiles,
  runServers,
  seedIdentity
} from "./agent/runtime"

const { root, directory } = await location()
const registry = new AgentRegistry(directory)
const operation = process.argv[2] ?? "start"
const decodeStorageOwner = Schema.decodeUnknownSync(
  Schema.Struct({ id: Schema.String })
)

async function secretsFor(environment: Environment): Promise<Secrets> {
  return readJson(
    path.join(registry.resources(environment), "secrets.json"),
    decodeSecrets
  )
}

async function findEnvironment(): Promise<Environment> {
  const environment = (await registry.read()).find(
    (entry) => entry.worktree === root
  )
  if (!environment)
    throw new Error(
      "No agent environment for this worktree. Run bun run dev:agent"
    )
  return environment
}

async function stop(environment: Environment): Promise<void> {
  const resources = registry.resources(environment)
  const file = path.join(resources, "running.json")
  if (!(await exists(file))) return
  const owner = await readJson(file, decodeRunning)
  if (!(await isRunning(owner)))
    throw new Error(
      `Server owner exited unexpectedly. Inspect ${file} and its remaining children before removing the marker`
    )
  await Bun.write(path.join(resources, "stop"), "stop\n")
  for (let attempt = 0; attempt < 80; attempt++) {
    if (
      !(await exists(file)) &&
      (await processIdentity(owner.launcher.pid)) !== owner.launcher.identity
    )
      return
    await Bun.sleep(250)
  }
  throw new Error("Server has not stopped; preserving environment")
}

async function clean(environment: Environment): Promise<void> {
  await stop(environment)
  const resources = registry.resources(environment)
  const storage = path.join(environment.worktree, ".agent.local")
  const storageExists = await stat(storage).then(
    () => true,
    (error: unknown) => {
      if (error instanceof Error && "code" in error && error.code === "ENOENT")
        return false
      throw error
    }
  )
  if (storageExists) {
    if (
      (await lstat(storage)).isSymbolicLink() ||
      (await realpath(storage)) !== storage
    )
      throw new Error("Storage path is redirected; refusing cleanup")
    const owner = await readJson(
      path.join(storage, "owner.json"),
      decodeStorageOwner
    )
    if (owner.id !== environment.id)
      throw new Error("Storage ownership does not match")
  }
  await registry.save(
    (await registry.read()).map((entry) =>
      entry.id === environment.id
        ? Object.assign({}, entry, {
            state: "deleting" satisfies Environment["state"]
          })
        : entry
    )
  )
  if (environment.server) {
    const infrastructure = await server(root, false)
    if (environment.server !== infrastructure.id)
      throw new Error("Agent Postgres instance changed; refusing cleanup")
    const pool = adminPool(infrastructure.port)
    try {
      await removeDatabase(pool, environment)
    } finally {
      await pool.end()
    }
  }
  if (storageExists) await rm(storage, { recursive: true })
  await rm(resources, { recursive: true, force: true })
  await registry.save(
    (await registry.read()).filter((entry) => entry.id !== environment.id)
  )
  process.stdout.write(
    `Removed agent environment ${environment.id} (${environment.worktree})\n`
  )
}

async function start(): Promise<void> {
  const environment = await registry.exclusive(async () => {
    const entries = await registry.read()
    const existing = entries.find((entry) => entry.worktree === root)
    if (existing) {
      if (existing.state !== "ready")
        throw new Error(
          "Previous setup/cleanup is incomplete. Run bun run dev:agent:clean before retrying"
        )
      return existing
    }
    const entry = decodeEnvironment({
      id: randomBytes(12).toString("hex"),
      worktree: root,
      state: "provisioning",
      migrations: [],
      fixture: fixtureVersion,
      server: ""
    })
    await registry.save([...entries, entry])
    await mkdir(registry.resources(entry), { mode: 0o700 })
    await writeJson(path.join(registry.resources(entry), "secrets.json"), {
      password: randomBytes(32).toString("hex"),
      auth: randomBytes(32).toString("hex"),
      encryption: randomBytes(32).toString("base64"),
      origin: ""
    })
    return entry
  })
  const name = `pp-${environment.id}.projectproject`
  const child = Bun.spawn(
    [
      "node",
      "node_modules/portless/dist/cli.js",
      name,
      process.execPath,
      "--no-env-file",
      "apps/backend/scripts/dev-agent.ts",
      "serve"
    ],
    {
      cwd: root,
      env: {
        ...childEnvironment(environment, await secretsFor(environment), "0"),
        PORTLESS_STATE_DIR: path.join(directory, "portless"),
        PORTLESS_PORT: "1355",
        PORTLESS_HTTPS: "1",
        PORTLESS_UNPRIVILEGED: "1",
        PORTLESS_PREFIX: ""
      },
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit"
    }
  )
  process.exitCode = await child.exited
}

async function serve(): Promise<void> {
  let running: Promise<void> | undefined
  await registry.exclusive(async () => {
    let environment = await findEnvironment()
    const origin = process.env.PORTLESS_URL
    if (
      !origin ||
      new URL(origin).hostname !==
        `pp-${environment.id}.projectproject.localhost` ||
      new URL(origin).protocol !== "https:"
    )
      throw new Error("Expected a local Portless origin")
    if (
      await exists(path.join(registry.resources(environment), "running.json"))
    )
      throw new Error("An agent server already owns this environment")
    const current = await migrationHistory(root)
    checkHistory(environment.migrations, current)
    if (environment.fixture !== fixtureVersion)
      throw new Error(
        "Fixture version changed. Explicitly clean and rebuild this environment"
      )
    const infrastructure = await server(root, true)
    if (environment.server && environment.server !== infrastructure.id)
      throw new Error("Agent Postgres instance changed; data was preserved")
    environment = { ...environment, server: infrastructure.id }
    await registry.save(
      (await registry.read()).map((entry) =>
        entry.id === environment.id ? environment : entry
      )
    )
    const secrets = { ...(await secretsFor(environment)), origin }
    await writeJson(
      path.join(registry.resources(environment), "secrets.json"),
      secrets
    )
    const env = childEnvironment(environment, secrets, infrastructure.port)
    const pool = adminPool(infrastructure.port)
    const fresh = environment.state === "provisioning"
    try {
      await waitForDatabase(pool)
      if (fresh) {
        await prepareFiles(environment)
        await provision(pool, environment, secrets.password)
      } else {
        await verifyOwnership(pool, environment)
      }
      await migrateDatabase(root, env.DATABASE_URL)
      if (fresh) await seedIdentity(env.DATABASE_URL)
    } finally {
      await pool.end()
    }
    const ready = Promise.withResolvers<void>()
    running = runServers(registry, environment, env, fresh, async () => {
      await registry.save(
        (await registry.read()).map((entry) =>
          entry.id === environment.id
            ? Object.assign({}, entry, {
                state: "ready" satisfies Environment["state"],
                migrations: current
              })
            : entry
        )
      )
      ready.resolve()
    })
    await Promise.race([running, ready.promise])
  })
  await running
}

async function main(): Promise<void> {
  switch (operation) {
    case "start":
      return start()
    case "serve":
      return serve()
    case "login":
      return registry.exclusive(async () => {
        const environment = await findEnvironment()
        if (environment.state !== "ready")
          throw new Error("Environment is not ready")
        const runningFile = path.join(
          registry.resources(environment),
          "running.json"
        )
        if (
          !(await exists(runningFile)) ||
          !(await isRunning(await readJson(runningFile, decodeRunning)))
        )
          throw new Error("Start this worktree with bun run dev:agent first")
        const infrastructure = await server(root, false)
        if (infrastructure.id !== environment.server)
          throw new Error("Agent Postgres instance changed")
        process.stdout.write(
          `${await loginUrl(root, childEnvironment(environment, await secretsFor(environment), infrastructure.port))}\n`
        )
      })
    case "stop":
      return registry.exclusive(async () => stop(await findEnvironment()))
    case "trust": {
      const child = Bun.spawn(
        ["node", "node_modules/portless/dist/cli.js", "trust"],
        {
          cwd: root,
          env: {
            ...process.env,
            PORTLESS_STATE_DIR: path.join(directory, "portless")
          },
          stdin: "inherit",
          stdout: "inherit",
          stderr: "inherit"
        }
      )
      process.exitCode = await child.exited
      return
    }
    case "clean":
      return registry.exclusive(async () => {
        const environment = (await registry.read()).find(
          (entry) => entry.worktree === root
        )
        if (!environment) {
          process.stdout.write(
            "No agent environment for this worktree; nothing to clean\n"
          )
          return
        }
        await clean(environment)
      })
    case "prune":
      return registry.exclusive(async () => {
        const registered = await command(
          ["git", "worktree", "list", "--porcelain", "-z"],
          root
        )
        const worktrees = new Set(
          registered
            .split("\0")
            .filter((field) => field.startsWith("worktree "))
            .map((field) => field.slice(9))
        )
        const candidates = []
        for (const entry of await registry.read()) {
          const present = await stat(entry.worktree).then(
            () => true,
            (error: unknown) => {
              if (
                error instanceof Error &&
                "code" in error &&
                error.code === "ENOENT"
              )
                return false
              throw error
            }
          )
          if (!present && !worktrees.has(entry.worktree)) candidates.push(entry)
        }
        process.stdout.write(
          candidates.length
            ? `${candidates.map((entry) => `${entry.id}  ${entry.worktree}`).join("\n")}\n`
            : "No orphaned agent environments\n"
        )
        if (!process.argv.includes("--yes")) {
          process.stdout.write(
            "Review candidates, then rerun bun run dev:agent:prune --yes to delete them\n"
          )
          return
        }
        for (const entry of candidates) await clean(entry)
      })
    default:
      throw new Error("Use start, stop, login, trust, clean or prune [--yes]")
  }
}

try {
  await main()
} catch (error) {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`
  )
  process.exitCode = 1
}
