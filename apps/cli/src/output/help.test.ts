import * as BunServices from "@effect/platform-bun/BunServices"
import { describe, expect, it } from "@effect/vitest"
import { CliOutput, Command } from "effect/cli"
import * as Console from "effect/Console"
import * as Effect from "effect/Effect"
import { FetchHttpClient } from "effect/http"
import * as Layer from "effect/Layer"

import { Browser } from "../auth/Browser"
import { Loopback } from "../auth/Loopback"
import { sharedFlagNames } from "../commands/root"
import { pp } from "../commands/tree"
import { ServerStore } from "../servers/ServerStore"
import { helpFormatter } from "./help"
import { plain } from "./terminal"

const services = (columns: number) =>
  Layer.mergeAll(
    CliOutput.layer(helpFormatter(plain, columns, sharedFlagNames)),
    ServerStore.layer,
    Browser.layer,
    Loopback.layer,
    FetchHttpClient.layer
  ).pipe(Layer.provideMerge(BunServices.layer))

const helpAt = (columns: number, ...args: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const printed: Array<string> = []
    const capture: Console.Console = {
      ...globalThis.console,
      log: (...parts: ReadonlyArray<unknown>) => {
        printed.push(parts.join(" "))
      }
    }
    yield* Command.runWith(pp, { version: "test" })([...args, "--help"]).pipe(
      Effect.provideService(Console.Console, capture),
      Effect.provide(services(columns))
    )
    return printed.join("\n").split("\n")
  })

const help = (...args: ReadonlyArray<string>) => helpAt(80, ...args)

const rows = (lines: ReadonlyArray<string>) =>
  lines.slice(
    lines.indexOf("COMMANDS") + 1,
    lines.indexOf("", lines.indexOf("COMMANDS"))
  )

describe("help", () => {
  it.effect(
    "lists every command on one line that fits an 80-column terminal",
    () =>
      Effect.gen(function* () {
        const top = yield* help()
        const names = rows(top).map((line) => line.trim().split(" ")[0] ?? "")
        const pages = yield* Effect.forEach(names, (name) =>
          Effect.map(help(name), (lines) => ({ name, lines }))
        )
        for (const { name, lines } of [{ name: "", lines: top }, ...pages]) {
          expect(lines.filter((line) => line.length > 80)).toEqual([])
          if (!lines.includes("COMMANDS")) continue
          expect(rows(lines).filter((line) => line.endsWith("…"))).toEqual([])
          expect(lines).toContain(
            `  Run \`${["pp", name].filter(Boolean).join(" ")} <command> --help\` for more about a command.`
          )
        }
        expect(rows(top)).toContain(
          "  tickets       Read, create and change tickets."
        )
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

  it.effect("wraps to a terminal narrower than 40 columns", () =>
    Effect.gen(function* () {
      for (const command of [["tickets", "list"], ["login"], ["use"]]) {
        const lines = yield* helpAt(36, ...command)
        expect(
          lines.filter((line) => line.length > 36 && !line.startsWith("  pp "))
        ).toEqual([])
      }
    })
  )
})
