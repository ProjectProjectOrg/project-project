import { drizzle } from "drizzle-orm/node-postgres"
import { migrate } from "drizzle-orm/node-postgres/migrator"
import { Pool } from "pg"

import { migrationsFolder } from "./migrations"

const pool = new Pool({ connectionString: process.env["DATABASE_URL"] })
await migrate(drizzle({ client: pool }), { migrationsFolder })
await pool.end()
process.stdout.write("Migrations applied\n")
