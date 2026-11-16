import { useAtomValue } from "@effect/atom-react"
import type { Project } from "@pp/shared"
import * as Result from "effect/reactivity/AsyncResult"
import * as Schema from "effect/Schema"
import { useEffect } from "react"

import { currentUserId } from "@/features/auth/atoms/auth"
import {
  projectsFor,
  projectsRequest
} from "@/features/projects/atoms/projects"
import {
  createLocalStorageStringCodec,
  useLocalStorageState
} from "@/hooks/useLocalStorageState"

const lastProjectCodec = createLocalStorageStringCodec(Schema.String)

export function useScopedProject(orgSlug: string, routeSlug: string | null) {
  const viewerId = useAtomValue(currentUserId)
  const [lastSlug, setLastSlug] = useLocalStorageState(
    `projectproject:sidebar-project:${viewerId ?? ""}:${orgSlug}`,
    lastProjectCodec,
    ""
  )
  useEffect(() => {
    if (routeSlug !== null) setLastSlug(routeSlug)
  }, [routeSlug, setLastSlug])

  const listResult = useAtomValue(projectsFor(projectsRequest(orgSlug)))
  const projects = Result.isSuccess(listResult)
    ? listResult.value.toSorted((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
      )
    : []
  const project: Project | null =
    projects.find((p) => p.slug === (routeSlug ?? lastSlug)) ??
    projects[0] ??
    null
  return { project, projects }
}
