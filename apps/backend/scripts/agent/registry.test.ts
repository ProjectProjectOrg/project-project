import { test, expect } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import { checkHistory, databaseName } from "./database"
import {
  AgentRegistry,
  Environment,
  command,
  createEnvironmentId,
  decodeEnvironment
} from "./registry"
import { childEnvironment } from "./runtime"

const entry = Environment.make({
  id: "0123456789abcdef01234567",
  worktree: "/fixture",
  state: "ready",
  migrations: [],
  fixture: 1,
  server: "fixture"
})

test("parallel registry updates preserve every environment", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "pp-agent-registry-"))
  try {
    const registry = new AgentRegistry(directory)
    await Promise.all(
      ["a", "b", "c"].map((suffix) =>
        registry.exclusive(async () => {
          const entries = await registry.read()
          await Bun.sleep(10)
          await registry.save([
            ...entries,
            { ...entry, worktree: `/fixture/${suffix}` }
          ])
        })
      )
    )
    expect(
      (await registry.read()).map((value) => value.worktree).toSorted()
    ).toEqual(["/fixture/a", "/fixture/b", "/fixture/c"])
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test("failed lifecycle work releases the lock for a retry", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "pp-agent-registry-"))
  try {
    const registry = new AgentRegistry(directory)
    const failure = await registry
      .exclusive(async () => {
        throw new Error("setup failed")
      })
      .catch((cause: unknown) => cause)
    expect(failure).toEqual(new Error("setup failed"))
    await registry.exclusive(() => registry.save([entry]))
    expect((await registry.read())[0]?.id).toBe(entry.id)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test("only append-only migration history can reuse a database", () => {
  const applied = [{ name: "001", hash: "original" }]
  expect(() =>
    checkHistory(applied, [...applied, { name: "002", hash: "next" }])
  ).not.toThrow()
  for (const history of [
    [],
    [{ name: "001", hash: "edited" }],
    [{ name: "other", hash: "original" }]
  ]) {
    expect(() => checkHistory(applied, history)).toThrow(
      "Migration history diverged"
    )
  }
})

test("app processes receive isolated credentials without inherited integration secrets", () => {
  const previous = process.env.SLACK_CLIENT_SECRET
  process.env.SLACK_CLIENT_SECRET = "daily-driver-secret"
  try {
    const env = childEnvironment(
      entry,
      {
        password: "a".repeat(64),
        auth: "fixture-auth",
        encryption: "fixture-key",
        origin: "https://fixture.localhost:1355"
      },
      "54321"
    )
    expect(env).not.toHaveProperty("SLACK_CLIENT_SECRET")
    expect(new URL(env.DATABASE_URL).pathname).toBe(
      "/pp_agent_0123456789abcdef01234567"
    )
    expect(env.PROJECTS_DIR).toBe("/fixture/.agent.local/projects")
    expect(env.FEEDBACK_SENDING_ENABLED).toBe("false")
  } finally {
    if (previous === undefined) delete process.env.SLACK_CLIENT_SECRET
    else process.env.SLACK_CLIENT_SECRET = previous
  }
})

test("cleanup is repeatable in a worktree with no agent environment", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "pp-agent-clean-"))
  try {
    await command(["git", "init", "--quiet", directory], directory)
    const script = path.resolve(import.meta.dirname, "../dev-agent.ts")
    for (let attempt = 0; attempt < 2; attempt++) {
      const output = await command(
        [process.execPath, "--no-env-file", script, "clean"],
        directory
      )
      expect(output).toContain("nothing to clean")
    }
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test("environment names identify the branch and fit SQL and hostname limits", () => {
  for (const [branch, label] of [
    ["feat/Readable-Names", "feat-readable-names"],
    ["fix/quotes'-and_underscores", "fix-quotes-and-underscores"],
    ["x".repeat(100), "x".repeat(40)],
    ["", "worktree"],
    ["修復", "worktree"]
  ]) {
    const environment = decodeEnvironment({
      ...entry,
      id: createEnvironmentId(branch)
    })
    expect(environment.id).toMatch(new RegExp(`^${label}-[a-f0-9]{8}$`))
    expect(databaseName(environment)).toBe(
      `pp_agent_${label.replaceAll("-", "_")}_${environment.id.slice(-8)}`
    )
    expect(databaseName(environment).length).toBeLessThanOrEqual(63)
    expect(`pp-${environment.id}`.length).toBeLessThanOrEqual(63)
  }
})
