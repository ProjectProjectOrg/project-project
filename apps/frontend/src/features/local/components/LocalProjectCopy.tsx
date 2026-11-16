import { useAtomMount } from "@effect/atom-react"

import { useProjectRoute } from "@/features/projects/hooks/useProject"

import { localProject } from "../atoms/localProject"
import { prefetchDescriptions } from "../atoms/localTicket"

export function LocalProjectCopy() {
  const { orgSlug, slug } = useProjectRoute()
  useAtomMount(localProject({ orgSlug, slug }))
  useAtomMount(prefetchDescriptions({ orgSlug, slug }))
  return null
}
