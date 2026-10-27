import { useAtomValue } from "@effect/atom-react"
import * as Result from "effect/reactivity/AsyncResult"

import { me } from "@/features/auth/atoms/auth"
import { useProjectActor } from "@/lib/access"

export function useCanManageGithub(orgSlug: string): boolean {
  const viewer = useAtomValue(me())
  return (
    useProjectActor().call("projects", "connectGithub") &&
    Result.isSuccess(viewer) &&
    viewer.value.activeOrgSlug === orgSlug
  )
}
