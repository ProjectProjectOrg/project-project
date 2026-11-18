import { createHash } from "node:crypto"
import { readdir, readFile } from "node:fs/promises"
import path from "node:path"

import { drizzle } from "drizzle-orm/node-postgres"
import { migrate } from "drizzle-orm/node-postgres/migrator"
import * as Schema from "effect/Schema"
import { Pool } from "pg"

import { command, type Environment } from "./registry"

const container = "projectproject-agent-postgres"
const volume = "projectproject-agent-postgres-data"
const label = "io.projectproject.agent=postgres-v1"
const adminPassword = "projectproject_agent_local"
const Container = Schema.Array(
  Schema.Struct({
    Id: Schema.String,
    Config: Schema.Struct({
      Image: Schema.String,
      Labels: Schema.Record(Schema.String, Schema.String)
    }),
    State: Schema.Struct({ Running: Schema.Boolean }),
    Mounts: Schema.Array(
      Schema.Struct({
        Type: Schema.String,
        Name: Schema.optional(Schema.String),
        Destination: Schema.String
      })
    ),
    NetworkSettings: Schema.Struct({
      Ports: Schema.Record(
        Schema.String,
        Schema.NullOr(
          Schema.Array(
            Schema.Struct({ HostIp: Schema.String, HostPort: Schema.String })
          )
        )
      )
    })
  })
)

const decodeContainer = Schema.decodeUnknownSync(Container)
const decodePassword = Schema.decodeUnknownSync(
  Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/))
)
const decodeVersion = Schema.decodeUnknownSync(
  Schema.Struct({ server_version_num: Schema.String })
)
const decodeDatabaseOwner = Schema.decodeUnknownSync(
  Schema.Struct({ marker: Schema.NullOr(Schema.String), owner: Schema.String })
)
const decodeRoleOwner = Schema.decodeUnknownSync(
  Schema.Struct({
    marker: Schema.NullOr(Schema.String),
    rolsuper: Schema.Boolean,
    rolcreatedb: Schema.Boolean,
    rolcreaterole: Schema.Boolean
  })
)
const decodeMarker = Schema.decodeUnknownSync(
  Schema.Struct({ marker: Schema.NullOr(Schema.String) })
)

export async function server(root: string, create: boolean) {
  const names = await command(
    [
      "docker",
      "ps",
      "-a",
      "--filter",
      `name=^/${container}$`,
      "--format",
      "{{.Names}}"
    ],
    root
  )
  const volumes = await command(
    [
      "docker",
      "volume",
      "ls",
      "--filter",
      `name=^${volume}$`,
      "--format",
      "{{.Name}}"
    ],
    root
  )
  if (volumes) {
    const owned = await command(
      [
        "docker",
        "volume",
        "inspect",
        "--format",
        '{{index .Labels "io.projectproject.agent"}}',
        volume
      ],
      root
    )
    if (owned !== "postgres-v1")
      throw new Error("Agent Postgres volume ownership does not match")
  }
  if (!names) {
    if (!create)
      throw new Error("Agent Postgres is missing; no resources were removed")
    await command(
      ["docker", "volume", "create", "--label", label, volume],
      root
    )
    await command(
      [
        "docker",
        "run",
        "-d",
        "--name",
        container,
        "--label",
        label,
        "-e",
        "POSTGRES_USER=pp_agent_admin",
        "-e",
        `POSTGRES_PASSWORD=${adminPassword}`,
        "-e",
        "POSTGRES_DB=postgres",
        "-p",
        "127.0.0.1::5432",
        "-v",
        `${volume}:/var/lib/postgresql/data`,
        "postgres:16-alpine"
      ],
      root
    )
  }
  const [info] = decodeContainer(
    JSON.parse(await command(["docker", "inspect", container], root))
  )
  if (
    !info ||
    info.Config.Labels["io.projectproject.agent"] !== "postgres-v1" ||
    info.Config.Image !== "postgres:16-alpine" ||
    !info.Mounts.some(
      (mount) =>
        mount.Type === "volume" &&
        mount.Name === volume &&
        mount.Destination === "/var/lib/postgresql/data"
    )
  )
    throw new Error("Agent Postgres ownership or version does not match")
  if (!info.State.Running) {
    if (!create)
      throw new Error(
        "Start agent Postgres before cleanup; no resources were removed"
      )
    await command(["docker", "start", container], root)
    return server(root, false)
  }
  const binding = info.NetworkSettings.Ports["5432/tcp"]?.[0]
  if (!binding || binding.HostIp !== "127.0.0.1")
    throw new Error("Agent Postgres must bind only to loopback")
  return { id: info.Id, port: binding.HostPort }
}

export function databaseName(environment: Environment) {
  return `pp_agent_${environment.id.replaceAll("-", "_")}`
}
export function adminUrl(port: string, database: string) {
  return `postgres://pp_agent_admin:${adminPassword}@127.0.0.1:${port}/${database}`
}

export function adminPool(port: string) {
  return new Pool({
    connectionString: adminUrl(port, "postgres"),
    connectionTimeoutMillis: 2000
  })
}

export async function waitForDatabase(pool: Pool) {
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const result = await pool.query("show server_version_num")
      const version = decodeVersion(result.rows[0])
      if (!version.server_version_num.startsWith("16"))
        throw new Error("Agent Postgres must use major version 16")
      return
    } catch (error) {
      if (attempt === 59) throw error
      await Bun.sleep(500)
    }
  }
}

export async function migrationHistory(root: string) {
  const directory = path.join(root, "packages/db/src/migrations")
  const entries = (await readdir(directory, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .toSorted((a, b) => a.name.localeCompare(b.name))
  const result = []
  for (const entry of entries) {
    const file = path.join(directory, entry.name, "migration.sql")
    result.push({
      name: entry.name,
      hash: createHash("sha256")
        .update(await readFile(file))
        .digest("hex")
    })
  }
  return result
}

export function checkHistory(
  applied: Environment["migrations"],
  current: Environment["migrations"]
) {
  if (
    applied.some(
      (migration, index) =>
        migration.name !== current[index]?.name ||
        migration.hash !== current[index]?.hash
    )
  ) {
    throw new Error(
      "Migration history diverged. Explicitly clean this environment and start again; data was preserved"
    )
  }
}

export async function provision(
  pool: Pool,
  environment: Environment,
  password: string
) {
  const name = databaseName(environment)
  const role = await pool.query("select 1 from pg_roles where rolname=$1", [
    name
  ])
  const database = await pool.query(
    "select shobj_description(oid, 'pg_database') as marker from pg_database where datname=$1",
    [name]
  )
  if (role.rowCount || database.rowCount)
    throw new Error(
      "Resources already exist for unfinished setup. Run dev:agent:clean before retrying"
    )
  decodePassword(password)
  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    await client.query(
      `CREATE ROLE "${name}" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD '${password}'`
    )
    await client.query(
      `COMMENT ON ROLE "${name}" IS 'pp-agent:${environment.id}'`
    )
    await client.query("COMMIT")
  } catch (error) {
    await client.query("ROLLBACK")
    throw error
  } finally {
    client.release()
  }
  await pool.query(
    `CREATE DATABASE "${name}" OWNER "${name}" TEMPLATE template0`
  )
  await pool.query(
    `COMMENT ON DATABASE "${name}" IS 'pp-agent:${environment.id}'`
  )
  await pool.query(`REVOKE ALL ON DATABASE "${name}" FROM PUBLIC`)
}

export async function verifyOwnership(pool: Pool, environment: Environment) {
  const name = databaseName(environment)
  const result = await pool.query(
    "select shobj_description(oid, 'pg_database') as marker, pg_get_userbyid(datdba) as owner from pg_database where datname=$1",
    [name]
  )
  const role = await pool.query(
    "select shobj_description(oid, 'pg_authid') as marker, rolsuper, rolcreatedb, rolcreaterole from pg_roles where rolname=$1",
    [name]
  )
  const roleOwner = decodeRoleOwner(role.rows[0])
  const owner = decodeDatabaseOwner(result.rows[0])
  const marker = `pp-agent:${environment.id}`
  if (
    roleOwner.marker !== marker ||
    roleOwner.rolsuper ||
    roleOwner.rolcreatedb ||
    roleOwner.rolcreaterole ||
    owner.owner !== name ||
    (owner.marker !== marker &&
      !(environment.state !== "ready" && owner.marker === null))
  ) {
    throw new Error(
      "Database or role ownership does not match; preserving resources"
    )
  }
}

export async function migrateDatabase(root: string, url: string) {
  const pool = new Pool({ connectionString: url })
  try {
    await migrate(drizzle({ client: pool }), {
      migrationsFolder: path.join(root, "packages/db/src/migrations")
    })
  } finally {
    await pool.end()
  }
}

export async function removeDatabase(pool: Pool, environment: Environment) {
  const name = databaseName(environment)
  const database = await pool.query(
    "select 1 from pg_database where datname=$1",
    [name]
  )
  if (database.rowCount) {
    await verifyOwnership(pool, environment)
    await pool.query(`DROP DATABASE "${name}"`)
  }
  const role = await pool.query(
    "select shobj_description(oid, 'pg_authid') as marker from pg_roles where rolname=$1",
    [name]
  )
  if (role.rowCount) {
    if (decodeMarker(role.rows[0]).marker !== `pp-agent:${environment.id}`)
      throw new Error("Role ownership does not match; preserving resources")
    await pool.query(`DROP ROLE "${name}"`)
  }
}
