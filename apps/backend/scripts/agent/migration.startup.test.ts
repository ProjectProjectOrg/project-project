import { expect, test } from "bun:test"

import { checkHistory } from "./database"
import { fixture } from "./migrationRegression"

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
