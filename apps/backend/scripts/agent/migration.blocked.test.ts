import { expect, test } from "bun:test"

import { fixture } from "./migrationRegression"

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
