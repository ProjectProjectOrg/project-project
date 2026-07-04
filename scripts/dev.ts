import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const isWindows = process.platform === "win32"
const children: Array<{ name: string; process: Bun.Subprocess }> = []
let stopping = false
let childEnv: Record<string, string | undefined> = process.env

function loadEnvFile(path: string) {
  const content = readFileSync(path, "utf8")
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith("#")) continue
    const index = line.indexOf("=")
    if (index === -1) continue
    const key = line.slice(0, index).trim()
    let value = line.slice(index + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    process.env[key] = value
  }
}

loadEnvFile(resolve(root, ".env"))
childEnv = { ...process.env }

async function run(command: string[]) {
  const process = Bun.spawn(command, {
    cwd: root,
    env: childEnv,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit"
  })
  const code = await process.exited
  if (code !== 0) {
    throw new Error(`${command.join(" ")} exited with ${code}`)
  }
}

async function output(command: string[]) {
  const process = Bun.spawn(command, {
    cwd: root,
    env: childEnv,
    stdout: "pipe",
    stderr: "pipe"
  })
  const [stdout, stderr, code] = await Promise.all([
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
    process.exited
  ])
  if (code !== 0) {
    throw new Error(
      `${command.join(" ")} exited with ${code}\n${stderr.trim()}`
    )
  }
  return stdout.trim()
}

async function waitForPostgres() {
  const deadline = Date.now() + 60_000

  while (Date.now() < deadline) {
    const status = await output([
      "docker",
      "inspect",
      "--format",
      "{{.State.Health.Status}}",
      "projectproject-postgres"
    ]).catch(() => "missing")

    if (status === "healthy") return
    if (status === "unhealthy") {
      throw new Error("projectproject-postgres became unhealthy")
    }

    await Bun.sleep(500)
  }

  throw new Error("projectproject-postgres did not become healthy within 60s")
}

function spawn(name: string, command: string[], cwd = root) {
  const process = Bun.spawn(command, {
    cwd,
    env: childEnv,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit"
  })
  children.push({ name, process })
  process.exited.then((code) => {
    if (!stopping) {
      console.error(`${name} exited with ${code}`)
      void shutdown(code === 0 ? 0 : code || 1)
    }
  })
}

async function killTree(pid: number) {
  if (isWindows) {
    await Bun.spawn(["taskkill", "/pid", String(pid), "/t", "/f"], {
      env: childEnv,
      stdout: "ignore",
      stderr: "ignore"
    }).exited
    return
  }
  try {
    process.kill(pid, "SIGTERM")
  } catch {}
  await Bun.sleep(750)
  try {
    process.kill(pid, "SIGKILL")
  } catch {}
}

async function shutdown(code = 0) {
  if (stopping) return
  stopping = true

  await Promise.all(
    children
      .filter((child) => child.process.pid !== undefined)
      .map((child) => killTree(child.process.pid!))
  )

  await Bun.spawn(["docker", "compose", "stop", "postgres"], {
    cwd: root,
    env: childEnv,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit"
  }).exited

  process.exit(code)
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    void shutdown(0)
  })
}

async function main() {
  try {
    await run(["docker", "compose", "up", "-d", "postgres"])
    await waitForPostgres()
    spawn(
      "backend",
      ["bun", "--env-file=../../.env", "--watch", "src/main.ts"],
      resolve(root, "packages/backend")
    )
    spawn("frontend", ["bun", "run", "dev"], resolve(root, "packages/frontend"))
    await new Promise(() => {})
  } catch (error) {
    console.error(error)
    await shutdown(1)
  }
}

await main()
