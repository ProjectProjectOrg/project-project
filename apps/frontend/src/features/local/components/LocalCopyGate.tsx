import * as Cause from "effect/Cause"
import type { ReactNode } from "react"

import { ErrorPage } from "@/components/shell/ErrorPage"
import { LoaderOverlay } from "@/components/shell/LoaderOverlay"
import { NotFoundPage } from "@/components/shell/NotFoundPage"
import { useProjectRoute } from "@/features/projects/hooks/useProject"
import { m } from "@/paraglide/messages"

import { useLocalCopy } from "../hooks/useLocalCopy"

export function LocalCopyGate({ children }: { children: ReactNode }) {
  const { slug } = useProjectRoute()
  const copy = useLocalCopy()
  if (copy.kind === "readable") return children
  if (copy.kind === "syncing") return <LoaderOverlay active />
  if (copy.kind === "denied")
    return (
      <NotFoundPage
        contained
        title={m.project_detail_not_found_title()}
        body={m.project_detail_not_found_body({ slug })}
      />
    )
  return (
    <ErrorPage
      contained
      error={copy.cause === null ? undefined : Cause.squash(copy.cause)}
      reset={copy.retry}
      title={m.project_detail_load_error_title()}
      body={m.project_detail_load_error_body()}
    />
  )
}
