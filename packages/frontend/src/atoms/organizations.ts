import { Atom } from "@effect-atom/atom-react"
import { Effect } from "effect"
import { runtime } from "@/runtime"
import { authClient } from "@/services/AuthClient"

export type UserOrganization = {
  readonly id: string
  readonly name: string
  readonly slug: string
  readonly logo?: string | null
}

export const userOrgsAtom = runtime
  .atom(
    Effect.tryPromise({
      try: async () => {
        const result = await authClient.$fetch<UserOrganization[]>(
          "/organization/list",
          { method: "GET" }
        )
        if (result.error) throw result.error
        const orgs = result.data ?? []
        return [...orgs].sort((a, b) => a.name.localeCompare(b.name))
      },
      catch: (cause) => cause
    })
  )
  .pipe(Atom.setIdleTTL("1 minute"))
