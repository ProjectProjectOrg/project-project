import { useAtomSet } from "@effect-atom/atom-react"
import { Plus } from "lucide-react"
import { useState } from "react"
import type { ProjectStatus } from "@projectproject/shared"
import { createStatusAtom, projectKey } from "@/atoms/projectStatuses"
import { Button } from "@/components/ui/button"
import { InlineForm, useInlineForm } from "@/components/ui/inline-form"
import { Input } from "@/components/ui/input"
import { m } from "@/paraglide/messages"

type Props = {
  orgSlug: string
  slug: string
}

export function StatusCreateRow({ orgSlug, slug }: Props) {
  const Root = InlineForm.Root<"create">
  return (
    <Root variant="ghost" className="self-start">
      <InlineForm.Idle>
        <InlineForm.Trigger
          action="create"
          variant="tertiary"
          size="sm"
          leadingIcon={Plus}
        >
          {m.tickets_status_create_add()}
        </InlineForm.Trigger>
      </InlineForm.Idle>
      <InlineForm.Form action="create" className="space-y-0">
        <CreateFields orgSlug={orgSlug} slug={slug} />
      </InlineForm.Form>
    </Root>
  )
}

function CreateFields({ orgSlug, slug }: Props) {
  const key = projectKey(orgSlug, slug)
  const create = useAtomSet(createStatusAtom(key))
  const { close } = useInlineForm<"create">()
  const [draft, setDraft] = useState("")

  const submit = () => {
    const trimmed = draft.trim()
    if (trimmed.length === 0) {
      setDraft("")
      close()
      return
    }
    create({ label: trimmed as ProjectStatus["label"] })
    setDraft("")
    close()
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
      className="flex items-center gap-2 px-1 py-1"
    >
      <span className="flex h-8 w-5 shrink-0 items-center justify-center text-muted-foreground/40">
        <Plus className="h-4 w-4" />
      </span>
      <Input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setDraft("")
            close()
          }
        }}
        placeholder={m.tickets_status_create_placeholder()}
        className="h-8 flex-1 rounded-md"
      />
      <Button
        type="button"
        size="sm"
        variant="ghost"
        onClick={() => {
          setDraft("")
          close()
        }}
      >
        {m.tickets_status_delete_cancel()}
      </Button>
      <Button
        type="submit"
        size="sm"
        variant="primary"
        disabled={!draft.trim()}
      >
        {m.tickets_status_create_add()}
      </Button>
    </form>
  )
}
