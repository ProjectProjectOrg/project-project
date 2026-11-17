import { useAtomMount } from "@effect/atom-react"

import { useProjectRoute } from "@/features/projects/hooks/useProject"

import { backgroundSync } from "../atoms/backgroundSync"
import { localProject } from "../atoms/localProject"
import { prefetchDescriptions } from "../atoms/localTicket"

export function LocalProjectCopy() {
  const { orgSlug, slug } = useProjectRoute()
  useAtomMount(localProject({ orgSlug, slug }))
  useAtomMount(prefetchDescriptions({ orgSlug, slug }))
  useAtomMount(backgroundSync({ orgSlug, slug }))
  return null
}
