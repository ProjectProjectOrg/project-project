import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import { ChildProcess, ChildProcessSpawner } from "effect/process"

const openers: ReadonlyArray<readonly [string, ReadonlyArray<string>]> = [
  ["open", []],
  ["xdg-open", []],
  ["cmd", ["/c", "start", ""]]
]

export class Browser extends Context.Service<
  Browser,
  Readonly<{ open: (url: string) => Effect.Effect<boolean> }>
>()("@pp/cli/auth/Browser") {
  static readonly layer = Layer.effect(
    Browser,
    Effect.gen(function* () {
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
      const tryOpen = (
        url: string,
        [command, args]: (typeof openers)[number]
      ) =>
        spawner.exitCode(ChildProcess.make(command, [...args, url])).pipe(
          Effect.map((code) => code === 0),
          Effect.orElseSucceed(() => false)
        )
      return Browser.of({
        open: (url) =>
          Effect.reduce(
            openers,
            () => false,
            (opened, opener) =>
              opened ? Effect.succeed(true) : tryOpen(url, opener)
          )
      })
    })
  )
}
