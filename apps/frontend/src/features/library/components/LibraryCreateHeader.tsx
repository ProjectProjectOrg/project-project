import { Plus } from "lucide-react"

import { InlineForm } from "@/components/ui/inline-form"
import {
  LibraryCreateForm,
  type LibraryCreateProps
} from "@/features/library/forms/library-create"
import { m } from "@/paraglide/messages"

import { LibrarySectionHeader } from "./LibrarySection"

type Heading = Readonly<{ id: string; title: string; description: string }>

export function LibraryCreateHeader({
  heading,
  ...props
}: LibraryCreateProps & Readonly<{ heading: Heading }>) {
  const Root = InlineForm.Root<"create">
  return (
    <Root actions={["create"]} variant="ghost" className="flex flex-col gap-3">
      <LibrarySectionHeader
        {...heading}
        action={
          <InlineForm.Idle>
            <InlineForm.Trigger
              action="create"
              variant="primary"
              size="sm"
              leadingIcon={Plus}
            >
              {props.kind === "template"
                ? m.templates_settings_new_template()
                : m.templates_settings_new_block()}
            </InlineForm.Trigger>
          </InlineForm.Idle>
        }
      />
      <InlineForm.Form action="create" className="space-y-0">
        <LibraryCreateForm {...props} />
      </InlineForm.Form>
    </Root>
  )
}
