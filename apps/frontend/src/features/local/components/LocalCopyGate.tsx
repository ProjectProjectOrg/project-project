import { useAtomValue } from "@effect/atom-react"
import * as Result from "effect/reactivity/AsyncResult"
import type { ReactNode } from "react"

import { LoaderOverlay } from "@/components/shell/LoaderOverlay"
import { useProjectRoute } from "@/features/projects/hooks/useProject"

import { localProject } from "../atoms/localProject"

export function LocalCopyGate({ children }: { children: ReactNode }) {
  const { orgSlug, slug } = useProjectRoute()
  const status = useAtomValue(localProject({ orgSlug, slug }))
  return Result.match(status, {
    onInitial: () => children,
    onFailure: () => children,
    onSuccess: ({ value }) =>
      value.kind === "initializing" ? <LoaderOverlay active /> : children
  })
}
