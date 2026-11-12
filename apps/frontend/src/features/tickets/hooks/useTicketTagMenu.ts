import { useAtomSet, useAtomValue } from "@effect/atom-react"
import type { TagName } from "@pp/shared"
import * as Exit from "effect/Exit"
import * as Result from "effect/reactivity/AsyncResult"
import { useState } from "react"

import { useProjectRoute } from "@/features/projects/hooks/useProject"
import { createTag, tagsFor, tagsRequest } from "@/features/tags/atoms/tags"
import type { TicketEdit } from "@/features/tickets/lib/ticketPatch"
import { useProjectActor } from "@/hooks/useActor"

export function useTicketTagMenu(
  applied: ReadonlyArray<string>,
  onPatch: (patch: TicketEdit) => void
) {
  const { orgSlug, slug } = useProjectRoute()
  const req = tagsRequest(orgSlug, slug)
  const result = useAtomValue(tagsFor(req))
  const create = useAtomSet(createTag(req), { mode: "promiseExit" })
  const canCreate = useProjectActor().call("tags", "create")
  const [draft, setDraft] = useState("")
  const toggle = (name: TagName) =>
    onPatch({
      tags: applied.includes(name) ? { remove: [name] } : { add: [name] }
    })
  const createAndApply = async (name: TagName) => {
    setDraft("")
    const exit = await create({ name })
    if (Exit.isSuccess(exit)) onPatch({ tags: { add: [name] } })
  }
  return {
    filterable: {
      value: draft,
      onValueChange: (next: string) => setDraft(next.toLowerCase())
    },
    onOpenChange: (open: boolean) => {
      if (!open) setDraft("")
    },
    body: {
      tags: Result.isSuccess(result) ? result.value : [],
      applied,
      draft,
      canCreate,
      onToggle: toggle,
      onCreate: (name: TagName) => void createAndApply(name)
    }
  }
}
