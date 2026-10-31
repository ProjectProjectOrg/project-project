import * as Effect from "effect/Effect"

export type PagerSink = Readonly<{
  write: (text: string) => Effect.Effect<boolean>
}>

type Env = Readonly<Record<string, string | undefined>>

const lessVersion = () => {
  try {
    const result = Bun.spawnSync(["less", "--version"], { stderr: "ignore" })
    const match = /less (\d+)/.exec(result.stdout.toString())
    return match?.[1] === undefined ? 0 : Number(match[1])
  } catch {
    return 0
  }
}

export const pagingEnabled = (env: Env) => {
  const chosen = (env.PP_PAGER ?? env.PAGER)?.trim()
  return chosen !== "" && chosen !== "cat"
}

export const pagerCommand = (
  env: Env,
  version: () => number = lessVersion
): ReadonlyArray<string> | undefined => {
  if (!pagingEnabled(env)) return undefined
  return version() >= 600 ? ["less", "--header=1"] : ["less"]
}

const stdoutSink: PagerSink = {
  write: (text) =>
    Effect.sync(() => {
      process.stdout.write(text)
      return true
    })
}

const open = Effect.sync(() => {
  const command = pagerCommand(process.env)
  if (command === undefined) return undefined
  try {
    const child = Bun.spawn([...command], {
      stdin: "pipe",
      stdout: "inherit",
      stderr: "inherit",
      env: { ...process.env, LESS: "FRXS", LESSSECURE: "1" }
    })
    const state = { closed: false }
    void child.exited.then(() => {
      state.closed = true
    })
    return { child, state }
  } catch {
    return undefined
  }
})

type Opened = Effect.Success<typeof open>

const sinkFor = (opened: Opened): PagerSink =>
  opened === undefined
    ? stdoutSink
    : {
        write: (text) =>
          opened.state.closed
            ? Effect.succeed(false)
            : Effect.tryPromise(async () => {
                await opened.child.stdin.write(text)
                return true
              }).pipe(
                Effect.orElseSucceed(() => {
                  opened.state.closed = true
                  return false
                })
              )
      }

const close = (opened: Opened) =>
  opened === undefined
    ? Effect.void
    : Effect.andThen(
        Effect.tryPromise(async () => {
          await opened.child.stdin.end()
        }).pipe(Effect.ignore),
        Effect.promise(() => opened.child.exited)
      )

export const withPager = <A, E, R>(
  use: (sink: PagerSink) => Effect.Effect<A, E, R>
) => Effect.acquireUseRelease(open, (opened) => use(sinkFor(opened)), close)
