import * as Console from "effect/Console"
import * as Effect from "effect/Effect"
import { TicketIndex } from "../src/Services/TicketIndex"
import { BackendRuntimeLive } from "../src/runtime"

const argValue = (name: string): string | undefined => {
  const prefix = `${name}=`
  const match = process.argv.find((arg) => arg.startsWith(prefix))
  if (match) return match.slice(prefix.length)
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

const main = Effect.gen(function* () {
  const ticketIndex = yield* TicketIndex
  const orgSlug = argValue("--org")
  const projectSlug = argValue("--project")

  if ((orgSlug === undefined) !== (projectSlug === undefined)) {
    return yield* Effect.fail(
      new Error("pass both --org and --project, or neither")
    )
  }

  const summary =
    orgSlug && projectSlug
      ? {
          projects: [
            yield* ticketIndex.rebuildProject(
              yield* ticketIndex.projectFor(orgSlug, projectSlug)
            )
          ]
        }
      : yield* ticketIndex.rebuildAllProjects()

  let totalIndexed = 0
  let totalSkipped = 0
  for (const project of summary.projects) {
    totalIndexed += project.indexed
    totalSkipped += project.skipped
    yield* Console.log(
      `[ticket-index] ${project.project.orgSlug}/${project.project.projectSlug}: indexed=${project.indexed} skipped=${project.skipped}`
    )
  }
  yield* Console.log(
    `[ticket-index] complete: projects=${summary.projects.length} indexed=${totalIndexed} skipped=${totalSkipped}`
  )
})

Effect.runPromise(main.pipe(Effect.provide(BackendRuntimeLive))).catch(
  (error) => {
    console.error(error)
    process.exitCode = 1
  }
)
