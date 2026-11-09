import { useAtomValue } from "@effect/atom-react"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import { LayoutTemplate } from "lucide-react"
import type { ComponentProps } from "react"

import { DropdownMenuItem } from "@/components/ui/dropdown-menu"
import { Popover, PopoverContent } from "@/components/ui/popover"
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
import { useOrgActor } from "@/hooks/useActor"
import { m } from "@/paraglide/messages"

function useTemplateLayers() {
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
  return layers.length === 0 ? null : { library, layers }
}

export function SaveAsTemplateMenuItem({
  onSelect
}: Readonly<{ onSelect: () => void }>) {
  if (useTemplateLayers() === null) return null
  return (
    <DropdownMenuItem onClick={onSelect} className="cursor-pointer">
      <LayoutTemplate className="size-4" strokeWidth={1.75} />
      {m.templates_save_as_action()}
    </DropdownMenuItem>
  )
}

export function SaveAsTemplatePopover({
  open,
  onOpenChange,
  anchor,
  finalFocus,
  ...props
}: SaveAsTemplateProps &
  Readonly<{
    open: boolean
    onOpenChange: (open: boolean) => void
    anchor: ComponentProps<typeof PopoverContent>["anchor"]
    finalFocus: ComponentProps<typeof PopoverContent>["finalFocus"]
  }>) {
  const target = useTemplateLayers()
  if (target === null) return null
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverContent
        anchor={anchor}
        finalFocus={finalFocus}
        align="end"
        className="w-72"
        onClick={(event) => event.stopPropagation()}
      >
        <SaveAsTemplateForm
          {...props}
          library={target.library}
          layers={target.layers}
        />
      </PopoverContent>
    </Popover>
  )
}
