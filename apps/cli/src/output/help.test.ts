import * as BunServices from "@effect/platform-bun/BunServices"
import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Path from "effect/Path"
import { ChildProcess, ChildProcessSpawner } from "effect/process"

const help = (...args: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const path = yield* Path.Path
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
    const main = path.resolve(import.meta.dirname, "..", "main.ts")
    const text = yield* spawner.string(
      ChildProcess.make(process.execPath, [main, ...args, "--help"], {
        env: { NO_COLOR: "1", PP_NO_UPDATE_CHECK: "1" },
        extendEnv: true
      })
    )
    return text.split("\n")
  }).pipe(Effect.provide(BunServices.layer))

describe("help", () => {
  it.effect(
    "fits an 80-column terminal and lists each command on one line",
    () =>
      Effect.gen(function* () {
        const lines = yield* help("tickets")
        expect(lines.filter((line) => line.length > 80)).toEqual([])
        const commands = lines.slice(lines.indexOf("COMMANDS") + 1)
        expect(commands.find((line) => line.startsWith("  update "))).toBe(
          "  update          Update a ticket."
        )
        expect(commands.find((line) => line.startsWith("  get "))).toMatch(/…$/)
      })
  )

  it.effect("keeps the shared flags out of a command's own flags", () =>
    Effect.gen(function* () {
      const lines = yield* help("tickets", "list")
      const flags = lines.slice(
        lines.indexOf("FLAGS"),
        lines.indexOf("GLOBAL FLAGS")
      )
      expect(flags.some((line) => line.includes("--status"))).toBe(true)
      expect(flags.some((line) => line.includes("--server"))).toBe(false)
      expect(lines.filter((line) => line.length > 80)).toEqual([])
    })
  )
})
