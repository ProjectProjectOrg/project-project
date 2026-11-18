import { useAtomValue } from "@effect/atom-react"
import type { Project } from "@pp/shared"
import * as Schema from "effect/Schema"
import { useEffect } from "react"

import { currentUserId } from "@/features/auth/atoms/auth"
import { useOrgProjects } from "@/features/projects/hooks/useOrgProjects"
import {
  createLocalStorageStringCodec,
  useLocalStorageState
} from "@/hooks/useLocalStorageState"

const lastProjectCodec = createLocalStorageStringCodec(Schema.String)

export function useScopedProject(
  orgSlug: string | null,
  routeSlug: string | null
) {
  const viewerId = useAtomValue(currentUserId)
  const [lastSlug, setLastSlug] = useLocalStorageState(
    `projectproject:sidebar-project:${viewerId ?? ""}:${orgSlug ?? ""}`,
    lastProjectCodec,
    ""
  )
  useEffect(() => {
    if (routeSlug !== null) setLastSlug(routeSlug)
  }, [routeSlug, setLastSlug])

  const projects = useOrgProjects(orgSlug)
  const project: Project | null =
    projects.find((p) => p.slug === (routeSlug ?? lastSlug)) ??
    projects[0] ??
    null
  return { project, projects }
}
