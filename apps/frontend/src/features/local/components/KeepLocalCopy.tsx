import { useAtomMount } from "@effect/atom-react"

import { useProjectRoute } from "@/features/projects/hooks/useProject"

import { localProject } from "../atoms/localProject"

export default function KeepLocalCopy() {
  const { orgSlug, slug } = useProjectRoute()
  useAtomMount(localProject({ orgSlug, slug }))
  return null
}
