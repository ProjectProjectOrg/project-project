import * as BunServices from "@effect/platform-bun/BunServices"
import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Path from "effect/Path"
import { ChildProcess, ChildProcessSpawner } from "effect/process"

const fakeRelease = (directory: string, tamper: boolean) =>
  [
    "set -eu",
    `cd '${directory}'`,
    "printf '#!/bin/sh\\necho fake pp\\n' > pp",
    "for asset in darwin-arm64 darwin-x64 linux-arm64 linux-x64; do gzip -c pp > pp-$asset.gz; done",
    "if command -v shasum >/dev/null 2>&1; then shasum -a 256 pp-*.gz > SHA256SUMS; else sha256sum pp-*.gz > SHA256SUMS; fi",
    tamper ? "sed -i.bak 's/^[0-9a-f]*/0000/' SHA256SUMS" : "true"
  ].join("\n")

const runInstaller = (tamper: boolean) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
    const home = yield* fs.makeTempDirectoryScoped()
    const release = path.join(home, "release")
    const bin = path.join(home, "bin")
    yield* fs.makeDirectory(release)
    yield* spawner.string(
      ChildProcess.make("sh", ["-c", fakeRelease(release, tamper)])
    )
    const script = path.resolve(import.meta.dirname, "..", "install.sh")
    const env = {
      HOME: home,
      PATH: "/usr/bin:/bin:/usr/sbin:/sbin",
      PP_DOWNLOAD_BASE: `file://${release}`,
      PP_INSTALL_DIR: bin,
      PP_NO_PROFILE: "1"
    }
    const code = yield* spawner.exitCode(
      ChildProcess.make("sh", [script], {
        env,
        stdout: "ignore",
        stderr: "ignore"
      })
    )
    const installed = yield* fs.exists(path.join(bin, "pp"))
    const output = installed
      ? yield* spawner.string(ChildProcess.make(path.join(bin, "pp"), []))
      : ""
    return { code, installed, output: output.trim() }
  }).pipe(Effect.scoped, Effect.provide(BunServices.layer))

describe("install.sh", () => {
  it.effect("installs the binary for this machine after checking it", () =>
    Effect.gen(function* () {
      expect(yield* runInstaller(false)).toEqual({
        code: 0,
        installed: true,
        output: "fake pp"
      })
    })
  )

  it.effect("refuses a download that doesn't match its checksum", () =>
    Effect.gen(function* () {
      const result = yield* runInstaller(true)
      expect(result.code).not.toBe(0)
      expect(result.installed).toBe(false)
    })
  )
})
