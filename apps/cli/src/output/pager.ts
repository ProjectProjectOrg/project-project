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

const chosenPager = (env: Env) => env.PP_PAGER ?? env.PAGER

export const pagingEnabled = (env: Env) => {
  const chosen = chosenPager(env)?.trim()
  return chosen !== "" && chosen !== "cat"
}

export const pagerCommand = (
  env: Env,
  version: () => number = lessVersion
): ReadonlyArray<string> | undefined => {
  if (!pagingEnabled(env)) return undefined
  const chosen = chosenPager(env)
  if (chosen !== undefined) return ["sh", "-c", chosen]
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
      env: { ...process.env, LESS: process.env.LESS ?? "FRXS" }
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
          Effect.sync(() => {
            if (opened.state.closed) return false
            try {
              void opened.child.stdin.write(text)
              return true
            } catch {
              opened.state.closed = true
              return false
            }
          })
      }

const close = (opened: Opened) =>
  opened === undefined
    ? Effect.void
    : Effect.andThen(
        Effect.sync(() => {
          try {
            void opened.child.stdin.end()
          } catch {
            opened.state.closed = true
          }
        }),
        Effect.promise(() => opened.child.exited)
      )

export const withPager = <A, E, R>(
  use: (sink: PagerSink) => Effect.Effect<A, E, R>
) => Effect.acquireUseRelease(open, (opened) => use(sinkFor(opened)), close)
