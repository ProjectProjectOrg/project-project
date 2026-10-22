import { createRequire } from "node:module"

import { INVITE_EMAIL_PATTERN } from "@pp/shared"
import { expect, it } from "vitest"

const betterAuthZodCore = createRequire(
  import.meta.resolve("better-auth")
).resolve("zod/v4/core")

it("matches the email regex better-auth's own zod will validate with", async () => {
  const nested: typeof import("zod/v4/core") = await import(betterAuthZodCore)
  expect(INVITE_EMAIL_PATTERN.source).toBe(nested.regexes.email.source)
})
