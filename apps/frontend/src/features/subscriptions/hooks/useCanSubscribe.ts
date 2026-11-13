import { useAtomValue } from "@effect/atom-react"
import * as AsyncResult from "effect/reactivity/AsyncResult"

import { currentUserId } from "@/features/auth/atoms/auth"
import { project } from "@/features/projects/atoms/projects"
import { useProjectRequest } from "@/features/projects/hooks/useProject"
import { canSubscribe } from "@/features/subscriptions/lib/canSubscribe"

export function useCanSubscribe(): boolean {
  const detail = useAtomValue(project(useProjectRequest()))
  const viewerId = useAtomValue(currentUserId)
  return AsyncResult.isSuccess(detail) && canSubscribe(detail.value, viewerId)
}
