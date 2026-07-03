import { Atom, Result } from "@effect-atom/atom-react"
import * as Effect from "effect/Effect"
import { runtime } from "@/runtime"
import { ApiClient } from "@/services/ApiClient"
import { authClient } from "@/services/AuthClient"
import { authData, meAtom } from "./auth"

export const orgKey = (orgSlug: string) => orgSlug

export const userOrgsAtom = runtime
  .atom(
    Effect.gen(function* () {
      const client = yield* ApiClient
      return yield* client.org.myOrgs()
    })
  )
  .pipe(Atom.setIdleTTL("1 minute"))

const orgDetailBaseAtom = Atom.family((orgSlug: string) =>
  runtime
    .atom(
      Effect.gen(function* () {
        const client = yield* ApiClient
        return yield* client.org.get({ path: { orgSlug } })
      })
    )
    .pipe(Atom.setIdleTTL("2 minutes"))
)

export const orgDetailAtom = Atom.family((orgSlug: string) =>
  Atom.optimistic(orgDetailBaseAtom(orgSlug))
)

export const renameOrgAtom = Atom.family((orgSlug: string) =>
  Atom.optimisticFn(orgDetailAtom(orgSlug), {
    reducer: (current, input: { name: string }) =>
      Result.isSuccess(current)
        ? Result.success(
            { ...current.value, name: input.name },
            { waiting: true }
          )
        : current,
    fn: runtime.fn(
      Effect.fn(function* (input: { name: string }, get) {
        const current = get(orgDetailBaseAtom(orgSlug))
        if (!Result.isSuccess(current)) {
          return yield* Effect.dieMessage("org detail not loaded")
        }
        yield* Effect.tryPromise(() =>
          authData(
            authClient.organization.update({
              data: { name: input.name },
              organizationId: current.value.id
            })
          )
        )
        get.refresh(orgDetailBaseAtom(orgSlug))
        get.refresh(userOrgsAtom)
        get.refresh(meAtom)
      })
    )
  })
)
