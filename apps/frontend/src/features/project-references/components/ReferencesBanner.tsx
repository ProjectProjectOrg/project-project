import { useAtomValue } from "@effect/atom-react"
import { Button } from "@pp/ui/button"
import { Unlink as Link2Off } from "@pp/ui/icons"
import { Link } from "@tanstack/react-router"
import * as Result from "effect/reactivity/AsyncResult"

import {
  referencesRequest,
  referencesToFix
} from "@/features/project-references/atoms/references"
import { useProjectRoute } from "@/features/projects/hooks/useProject"
import { useProjectActor } from "@/hooks/useActor"
import { m } from "@/paraglide/messages"

export function ReferencesBanner() {
  const canFix = useProjectActor().call("projectReferences", "list")
  return canFix ? <UnresolvedReferences /> : null
}

function UnresolvedReferences() {
  const { orgSlug, slug } = useProjectRoute()
  const result = useAtomValue(referencesToFix(referencesRequest(orgSlug, slug)))
  const count = Result.isSuccess(result) ? result.value.items.length : 0
  if (count === 0) return null

  return (
    <section className="flex items-center gap-2.5 rounded-xl border border-border px-4 py-2.5">
      <Link2Off
        className="size-4 shrink-0 text-muted-foreground"
        strokeWidth={1.75}
      />
      <p className="min-w-0 flex-1 text-body">
        {m.project_references_banner({ count })}
      </p>
      <Button
        variant="tertiary"
        size="sm"
        render={
          <Link
            to="/orgs/$orgSlug/projects/$slug/references"
            params={{ orgSlug, slug }}
          />
        }
      >
        {m.project_references_banner_action()}
      </Button>
    </section>
  )
}
