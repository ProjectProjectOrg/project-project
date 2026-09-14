import * as Atom from "effect/unstable/reactivity/Atom"
import * as Effect from "effect/Effect"
import { runtime } from "@/runtime"
import { ApiClient } from "@/services/ApiClient"

export const jiraProfileAtom = runtime
  .atom(
    Effect.gen(function* () {
      const client = yield* ApiClient
      return yield* client.jira.profile()
    })
  )
  .pipe(Atom.setIdleTTL("1 minute"))

export const jiraSitesAtom = runtime
  .atom(
    Effect.gen(function* () {
      const client = yield* ApiClient
      return yield* client.jira.sites()
    })
  )
  .pipe(Atom.setIdleTTL("1 minute"))

export const jiraProjectsAtom = Atom.family((cloudId: string) =>
  cloudId
    ? runtime
        .atom(
          Effect.gen(function* () {
            const client = yield* ApiClient
            return yield* client.jira.projects({ params: { cloudId } })
          })
        )
        .pipe(Atom.setIdleTTL("1 minute"))
    : runtime.atom(Effect.succeed([]))
)
