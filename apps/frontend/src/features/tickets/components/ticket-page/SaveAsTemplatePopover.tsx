import { useAtomValue } from "@effect/atom-react"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import { LayoutTemplate } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from "@/components/ui/popover"
import {
  projectLibraryFor,
  projectLibraryRequest
} from "@/features/library/atoms/library"
import type { LibraryLayer } from "@/features/library/atoms/libraryScope"
import { useProjectRoute } from "@/features/projects/hooks/useProject"
import {
  SaveAsTemplateForm,
  type SaveAsTemplateProps
} from "@/features/tickets/forms/save-as-template"
import { useOrgActor } from "@/lib/access"
import { m } from "@/paraglide/messages"

export function SaveAsTemplatePopover(props: SaveAsTemplateProps) {
  const { orgSlug, slug } = useProjectRoute()
  const libraryResult = useAtomValue(
    projectLibraryFor(projectLibraryRequest(orgSlug, slug))
  )
  const orgAdmin = useOrgActor(orgSlug).call("library", "createOrgTemplate")
  if (!AsyncResult.isSuccess(libraryResult)) return null
  const library = libraryResult.value
  const layers: ReadonlyArray<LibraryLayer> = [
    ...(library.canEdit ? (["project"] as const) : []),
    ...(orgAdmin ? (["org"] as const) : [])
  ]
  if (layers.length === 0) return null
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={m.templates_save_as_action()}
            title={m.templates_save_as_action()}
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            <LayoutTemplate strokeWidth={1.75} />
          </Button>
        }
      />
      <PopoverContent align="end" className="w-72">
        <SaveAsTemplateForm {...props} library={library} layers={layers} />
      </PopoverContent>
    </Popover>
  )
}
