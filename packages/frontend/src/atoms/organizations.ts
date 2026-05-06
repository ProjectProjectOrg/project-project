import { Atom, Result } from "@effect-atom/atom-react"
import { Effect } from "effect"
import { meAtom, meBaseAtom } from "@/atoms/auth"
import { projectsListAtom } from "@/atoms/projects"
import { authClient } from "@/services/AuthClient"
import { runtime } from "@/runtime"
import type { UserOrganization } from "@projectproject/shared"

export const switchOrgAtom = Atom.optimisticFn(meAtom, {
  reducer: (current, org: UserOrganization) => {
    if (!Result.isSuccess(current)) return current
    return Result.success(
      { ...current.value, activeOrgSlug: org.slug },
      { waiting: true }
    )
  },
  fn: runtime.fn(
    Effect.fn(function* (org: UserOrganization, get) {
      yield* Effect.tryPromise({
        try: async () => {
          const result = await authClient.$fetch("/organization/set-active", {
            method: "POST",
            body: { organizationId: org.id }
          })
          if (result.error) throw result.error
        },
        catch: (cause) => cause
      })
      get.refresh(meBaseAtom)
      get.refresh(projectsListAtom(org.slug))
    })
  )
})
