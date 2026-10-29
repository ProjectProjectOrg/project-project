import * as BunServices from "@effect/platform-bun/BunServices"
import { describe, expect, it } from "@effect/vitest"
import { runInstaller } from "@pp/shared"
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

const install = (tamper: boolean, shell?: string) =>
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
      ...(shell === undefined ? { PP_NO_PROFILE: "1" } : { SHELL: shell })
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
    const profile = (name: string) =>
      fs
        .readFileString(path.join(home, name))
        .pipe(Effect.orElseSucceed(() => ""))
    return {
      code,
      installed,
      output: output.trim(),
      bashrc: yield* profile(".bashrc"),
      bashProfile: yield* profile(".bash_profile")
    }
  }).pipe(Effect.scoped, Effect.provide(BunServices.layer))

describe("install.sh", () => {
  it.effect("installs the binary for this machine after checking it", () =>
    Effect.gen(function* () {
      expect(yield* install(false)).toMatchObject({
        code: 0,
        installed: true,
        output: "fake pp"
      })
    })
  )

  it.effect("refuses a download that doesn't match its checksum", () =>
    Effect.gen(function* () {
      const result = yield* install(true)
      expect(result.code).not.toBe(0)
      expect(result.installed).toBe(false)
    })
  )

  it.effect("puts pp on the PATH for bash login and non-login shells", () =>
    Effect.gen(function* () {
      const result = yield* install(false, "/bin/bash")
      expect(result.bashrc).toContain("# Added by the pp installer")
      expect(result.bashProfile).toContain("# Added by the pp installer")
    })
  )
})

const runScript = (script: string, failDownload: boolean) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
    const home = yield* fs.makeTempDirectoryScoped()
    const fakeCurl = path.join(home, "curl")
    yield* fs.writeFileString(
      fakeCurl,
      failDownload
        ? "#!/bin/sh\nexit 22\n"
        : "#!/bin/sh\necho 'echo \"installing $PP_VERSION\"'\n"
    )
    yield* fs.chmod(fakeCurl, 0o755)
    const out = path.join(home, "out")
    const code = yield* spawner.exitCode(
      ChildProcess.make("sh", ["-c", `{ ${script}\n} > '${out}' 2>&1`], {
        env: { PATH: `${home}:/usr/bin:/bin` }
      })
    )
    return { code, output: yield* fs.readFileString(out) }
  }).pipe(Effect.scoped, Effect.provide(BunServices.layer))

describe("runInstaller", () => {
  it.effect("runs the downloaded installer with the given settings", () =>
    Effect.gen(function* () {
      const result = yield* runScript(
        runInstaller("https://pp.example.com/install.sh", {
          PP_VERSION: "v2026.10.29"
        }),
        false
      )
      expect(result).toEqual({ code: 0, output: "installing v2026.10.29\n" })
    })
  )

  it.effect("fails, and says why, when the installer can't be downloaded", () =>
    Effect.gen(function* () {
      const result = yield* runScript(
        runInstaller("https://pp.example.com/install.sh", {}),
        true
      )
      expect(result.code).toBe(1)
      expect(result.output).toContain(
        "couldn't download the installer from https://pp.example.com/install.sh"
      )
    })
  )
})
