import { useAtomSet } from "@effect-atom/atom-react"
import { Plus, X } from "lucide-react"
import { useState } from "react"
import type { ProjectStatus } from "@projectproject/shared"
import { createStatusAtom, projectKey } from "@/atoms/projectStatuses"
import { m } from "@/paraglide/messages"

type Props = {
  orgSlug: string
  slug: string
}

export function StatusCreateRow({ orgSlug, slug }: Props) {
  const key = projectKey(orgSlug, slug)
  const create = useAtomSet(createStatusAtom(key))
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState("")

  const submit = () => {
    const trimmed = draft.trim()
    if (trimmed.length === 0) {
      setEditing(false)
      setDraft("")
      return
    }
    create({ label: trimmed as ProjectStatus["label"] })
    setDraft("")
    setEditing(false)
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="flex items-center gap-2 self-start rounded-md border border-dashed border-border bg-background px-3 py-2 text-sm text-muted-foreground transition-colors duration-100 hover:border-border hover:text-foreground active:scale-[0.97]"
      >
        <Plus className="h-4 w-4" />
        {m.tickets_status_create_add()}
      </button>
    )
  }

  return (
    <div className="flex items-center gap-2 rounded-md border border-input bg-card p-2">
      <Plus className="h-4 w-4 text-muted-foreground" />
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={submit}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit()
          if (e.key === "Escape") {
            setDraft("")
            setEditing(false)
          }
        }}
        placeholder={m.tickets_status_create_placeholder()}
        className="flex-1 rounded-md border border-input bg-background px-2 py-1 text-sm"
      />
      <button
        type="button"
        onClick={() => {
          setDraft("")
          setEditing(false)
        }}
        aria-label={m.tickets_status_delete_cancel()}
        className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors duration-100 hover:bg-accent active:scale-[0.97]"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
