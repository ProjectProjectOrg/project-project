import type { Library } from "@pp/shared"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog"
import { LibraryCreateForm } from "@/features/library/forms/library-create"
import { m } from "@/paraglide/messages"

import type { LibraryScope } from "../atoms/libraryScope"

export function NewSectionDialog({
  scope,
  library,
  typeName,
  open,
  onOpenChange,
  onCreated
}: Readonly<{
  scope: LibraryScope
  library: Library
  typeName: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (key: string) => void
}>) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{m.templates_new_section_title()}</DialogTitle>
          <DialogDescription>
            {m.templates_new_section_for_type({ name: typeName })}
          </DialogDescription>
        </DialogHeader>
        <LibraryCreateForm
          kind="section"
          scope={scope}
          library={library}
          orgLibrary={null}
          layers={[scope.layer]}
          orgName=""
          compact
          onCreated={(key) => {
            onCreated(key)
            onOpenChange(false)
          }}
          onCancel={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  )
}
