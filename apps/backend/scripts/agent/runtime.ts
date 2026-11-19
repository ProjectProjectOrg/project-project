import { mkdir, rm } from "node:fs/promises"
import { hostname } from "node:os"
import path from "node:path"

import type { Subprocess } from "bun"
import * as Schema from "effect/Schema"

import { databaseName } from "./database"
import { seedContent, seedIdentity, fixturePath } from "./fixture"
import {
  exists,
  processIdentity,
  writeJson,
  type AgentRegistry,
  type Environment
} from "./registry"

export const Secrets = Schema.Struct({
  password: Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/)),
  auth: Schema.String,
  encryption: Schema.String,
  origin: Schema.String
})
export type Secrets = typeof Secrets.Type
export const decodeSecrets = Schema.decodeUnknownSync(Secrets)

const gitHubStatePath = (environment: Environment) =>
  path.join(environment.worktree, ".agent.local", "github.json")

export function childEnvironment(
  environment: Environment,
  secrets: Secrets,
  port: string
) {
  const inherited = Object.fromEntries(
    [
      "PATH",
      "HOME",
      "TMPDIR",
      "SHELL",
      "USER",
      "LANG",
      "DOCKER_HOST",
      "DOCKER_CONTEXT"
    ].flatMap((key) => (process.env[key] ? [[key, process.env[key]]] : []))
  )
  const name = databaseName(environment)
  return {
    ...inherited,
    NODE_ENV: "development",
    DATABASE_URL: `postgres://${name}:${secrets.password}@127.0.0.1:${port}/${name}`,
    PROJECTS_DIR: path.join(environment.worktree, ".agent.local", "projects"),
    GITHUB_FAKE_STATE: gitHubStatePath(environment),
    BETTER_AUTH_URL: secrets.origin,
    BETTER_AUTH_SECRET: secrets.auth,
    USER_SECRET_ENCRYPTION_KEY: secrets.encryption,
    FEEDBACK_SENDING_ENABLED: "false",
    FEEDBACK_INTAKE_ENABLED: "false"
  }
}

export async function loginUrl(root: string, env: Record<string, string>) {
  const child = Bun.spawn(
    [process.execPath, "--no-env-file", "apps/backend/scripts/agent/login.ts"],
    { cwd: root, env, stdout: "pipe", stderr: "pipe" }
  )
  const [output, errors, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited
  ])
  if (code !== 0) throw new Error(`Login failed: ${errors}`)
  const url = output.match(/\[magic-link\].* url=(\S+)/)?.[1]
  if (!url) throw new Error("No magic link was generated")
  return url
}

export function portlessEnvironment(directory: string) {
  return {
    PORTLESS_STATE_DIR: path.join(directory, "portless"),
    PORTLESS_PORT: "1355",
    PORTLESS_HTTPS: "1",
    PORTLESS_UNPRIVILEGED: "1",
    PORTLESS_PREFIX: ""
  }
}

async function portless(
  registry: AgentRegistry,
  environment: Environment,
  env: Record<string, string>,
  args: string[]
) {
  const child = Bun.spawn(
    [
      "node",
      path.join(environment.worktree, "node_modules/portless/dist/cli.js"),
      ...args
    ],
    {
      cwd: environment.worktree,
      env: { ...env, ...portlessEnvironment(registry.directory) },
      stdout: "ignore",
      stderr: "pipe"
    }
  )
  const [errors, code] = await Promise.all([
    new Response(child.stderr).text(),
    child.exited
  ])
  if (code !== 0) throw new Error(`portless ${args[0]} failed: ${errors}`)
}

async function freePort() {
  const probe = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch: () => new Response()
  })
  const port = probe.port!
  await probe.stop(true)
  return port
}

async function waitForServer(
  child: Subprocess<"ignore", "inherit", "inherit">,
  url: string,
  signal: AbortSignal
) {
  for (let attempt = 0; attempt < 180; attempt++) {
    if (signal.aborted) throw new Error("Agent startup stopped")
    if (child.exitCode !== null)
      throw new Error("Agent server exited during startup")
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1000) })
      if (response.ok) return
    } catch {}
    await Bun.sleep(500)
  }
  throw new Error("Agent server did not become ready")
}

export async function runServers(
  registry: AgentRegistry,
  environment: Environment,
  env: Record<string, string>,
  fresh: boolean,
  ready: () => Promise<void>
) {
  const resources = registry.resources(environment)
  const runningFile = path.join(resources, "running.json")
  if (await exists(runningFile))
    throw new Error(
      "A previous server owns this environment. Run dev:agent:clean or inspect running.json"
    )
  const identity = await processIdentity(process.pid)
  if (!identity) throw new Error("Cannot establish server process identity")
  const launcherIdentity = await processIdentity(process.ppid)
  if (!launcherIdentity)
    throw new Error("Cannot establish Portless process identity")
  await writeJson(runningFile, {
    pid: process.pid,
    host: hostname(),
    identity,
    launcher: { pid: process.ppid, identity: launcherIdentity }
  })
  const stopper = path.join(resources, "stop")
  await rm(stopper, { force: true })
  const port = await freePort()
  const backend = Bun.spawn(
    [process.execPath, "--no-env-file", "apps/backend/src/main.ts"],
    {
      cwd: environment.worktree,
      env: { ...env, PORT: String(port), HOST: "127.0.0.1" },
      stdout: "inherit",
      stderr: "inherit"
    }
  )
  let frontend: Subprocess<"ignore", "inherit", "inherit"> | undefined
  let gallery: Subprocess<"ignore", "inherit", "inherit"> | undefined
  const galleryName = `pp-${environment.id}-gallery.projectproject`
  let galleryAliased = false
  const shutdown = new AbortController()
  const stop = () => {
    shutdown.abort()
  }
  process.on("SIGINT", stop)
  process.on("SIGTERM", stop)
  try {
    const target = `http://127.0.0.1:${port}`
    await waitForServer(backend, `${target}/api/health`, shutdown.signal)
    if (fresh)
      await seedContent(
        target,
        await loginUrl(environment.worktree, env),
        gitHubStatePath(environment)
      )
    const frontendPort = process.env.PORT
    if (!frontendPort || !/^\d+$/.test(frontendPort))
      throw new Error(
        "Start through dev:agent so Portless assigns the frontend port"
      )
    frontend = Bun.spawn(
      [
        "node",
        path.join(environment.worktree, "node_modules/vite/bin/vite.js"),
        "--host",
        "127.0.0.1",
        "--port",
        frontendPort,
        "--strictPort"
      ],
      {
        cwd: path.join(environment.worktree, "apps/frontend"),
        env: {
          ...env,
          AGENT_API_TARGET: target,
          AGENT_PUBLIC_URL: env.BETTER_AUTH_URL
        },
        stdout: "inherit",
        stderr: "inherit"
      }
    )
    const galleryPort = await freePort()
    gallery = Bun.spawn(
      [
        "node",
        path.join(environment.worktree, "node_modules/vite/bin/vite.js"),
        "--config",
        "gallery/vite.config.ts",
        "--host",
        "127.0.0.1",
        "--port",
        String(galleryPort)
      ],
      {
        cwd: path.join(environment.worktree, "packages/ui"),
        env,
        stdout: "inherit",
        stderr: "inherit"
      }
    )
    await portless(registry, environment, env, [
      "alias",
      galleryName,
      String(galleryPort),
      "--force"
    ])
    galleryAliased = true
    await waitForServer(
      frontend,
      `http://127.0.0.1:${frontendPort}/`,
      shutdown.signal
    )
    await ready()
    const galleryUrl = new URL(env.BETTER_AUTH_URL)
    galleryUrl.hostname = `${galleryName}.localhost`
    process.stdout.write(
      `\nAgent app: ${env.BETTER_AUTH_URL}${fixturePath}\nLogin: ${await loginUrl(environment.worktree, env)}\nGallery: ${galleryUrl}\n\n`
    )
    while (!shutdown.signal.aborted && !(await exists(stopper))) {
      if (
        backend.exitCode !== null ||
        frontend.exitCode !== null ||
        gallery.exitCode !== null
      )
        throw new Error("An agent server exited")
      await Bun.sleep(250)
    }
  } finally {
    process.off("SIGINT", stop)
    process.off("SIGTERM", stop)
    for (const child of [gallery, frontend, backend]) {
      if (!child) continue
      child.kill("SIGTERM")
      const finished = await Promise.race([
        child.exited.then(() => true),
        Bun.sleep(5000).then(() => false)
      ])
      if (!finished) {
        child.kill("SIGKILL")
        await child.exited
      }
    }
    if (galleryAliased)
      await portless(registry, environment, env, [
        "alias",
        "--remove",
        galleryName
      ]).catch(() => {})
    await rm(runningFile, { force: true })
    await rm(stopper, { force: true })
  }
}

export async function prepareFiles(environment: Environment) {
  const directory = path.join(environment.worktree, ".agent.local")
  if (await Bun.file(path.join(directory, "owner.json")).exists())
    throw new Error("Worktree storage already exists; refusing to overwrite it")
  await mkdir(path.join(directory, "projects"), {
    recursive: true,
    mode: 0o700
  })
  await writeJson(path.join(directory, "owner.json"), { id: environment.id })
}

export { seedIdentity }
