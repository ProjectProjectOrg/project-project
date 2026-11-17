import { mkdir, open, readFile, realpath, rename, rm } from "node:fs/promises"
import { hostname } from "node:os"
import path from "node:path"

import * as Schema from "effect/Schema"

const Id = Schema.String.check(Schema.isPattern(/^[a-f0-9]{24}$/))
const Migration = Schema.Struct({ name: Schema.String, hash: Schema.String })
export const Environment = Schema.Struct({
  id: Id,
  worktree: Schema.String,
  state: Schema.Literals(["provisioning", "ready", "deleting"]),
  migrations: Schema.Array(Migration),
  fixture: Schema.Number,
  server: Schema.String
})
export type Environment = typeof Environment.Type
const Registry = Schema.Array(Environment)
const Lock = Schema.Struct({
  pid: Schema.Number,
  host: Schema.String,
  token: Schema.String
})
export const Running = Schema.Struct({
  pid: Schema.Number,
  host: Schema.String,
  identity: Schema.String,
  launcher: Schema.Struct({ pid: Schema.Number, identity: Schema.String })
})
export type Running = typeof Running.Type
export const decodeRunning = Schema.decodeUnknownSync(Running)
export const decodeEnvironment = Schema.decodeUnknownSync(Environment)
const decodeRegistry = Schema.decodeUnknownSync(Registry)
const decodeLock = Schema.decodeUnknownSync(Lock)

export async function command(
  args: ReadonlyArray<string>,
  cwd: string
): Promise<string> {
  const child = Bun.spawn([...args], { cwd, stdout: "pipe", stderr: "pipe" })
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited
  ])
  if (code !== 0) throw new Error(`${args[0]} failed: ${stderr.trim()}`)
  return stdout.trim()
}

export async function location(): Promise<
  Readonly<{ root: string; directory: string }>
> {
  const root = await realpath(
    await command(["git", "rev-parse", "--show-toplevel"], process.cwd())
  )
  const common = await command(
    ["git", "rev-parse", "--path-format=absolute", "--git-common-dir"],
    root
  )
  return { root, directory: path.join(common, "pp-agent") }
}

export async function readJson<A>(
  file: string,
  decode: (input: unknown) => A
): Promise<A> {
  return decode(JSON.parse(await readFile(file, "utf8")))
}

export async function writeJson(file: string, value: object): Promise<void> {
  const temporary = `${file}.${crypto.randomUUID()}.tmp`
  await Bun.write(temporary, `${JSON.stringify(value, null, 2)}\n`, {
    mode: 0o600
  })
  await rename(temporary, file)
}

export async function exists(file: string): Promise<boolean> {
  try {
    await readFile(file)
    return true
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT")
      return false
    throw error
  }
}

export async function processIdentity(pid: number): Promise<string | null> {
  try {
    return await command(
      ["ps", "-p", String(pid), "-o", "lstart=", "-o", "command="],
      process.cwd()
    )
  } catch {
    return null
  }
}

export async function isRunning(owner: Running): Promise<boolean> {
  if (owner.host !== hostname())
    throw new Error(
      "Environment belongs to another host; refusing to signal or clean it"
    )
  const identity = await processIdentity(owner.pid)
  if (identity !== null && identity !== owner.identity)
    throw new Error(
      "Process identity changed; inspect running.json before cleanup"
    )
  return identity !== null
}

export class AgentRegistry {
  readonly directory: string
  constructor(directory: string) {
    this.directory = directory
  }
  resources(environment: Environment): string {
    return path.join(this.directory, environment.id)
  }
  async read(): Promise<typeof Registry.Type> {
    const file = path.join(this.directory, "registry.json")
    return (await exists(file)) ? await readJson(file, decodeRegistry) : []
  }
  async save(environments: typeof Registry.Type): Promise<void> {
    await writeJson(path.join(this.directory, "registry.json"), environments)
  }
  async exclusive<A>(run: () => Promise<A>): Promise<A> {
    await mkdir(this.directory, { recursive: true, mode: 0o700 })
    const file = path.join(this.directory, "registry.lock")
    const owner = {
      pid: process.pid,
      host: hostname(),
      token: crypto.randomUUID()
    }
    const deadline = Date.now() + 60_000
    for (;;) {
      try {
        const handle = await open(file, "wx", 0o600)
        try {
          await handle.writeFile(JSON.stringify(owner))
        } finally {
          await handle.close()
        }
        break
      } catch (error) {
        if (
          !(error instanceof Error) ||
          !("code" in error) ||
          error.code !== "EEXIST"
        )
          throw error
        if (Date.now() > deadline)
          throw new Error(
            `Registry is locked. Inspect ${file}; never delete a live owner's lock`,
            { cause: error }
          )
        await Bun.sleep(250)
      }
    }
    try {
      return await run()
    } finally {
      const current = await readJson(file, decodeLock)
      if (current.token === owner.token) await rm(file)
    }
  }
}
