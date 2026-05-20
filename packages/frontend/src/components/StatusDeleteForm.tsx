import { useAtomSet } from "@effect-atom/atom-react"
import { useState } from "react"
import type { ProjectStatus, StatusSlug } from "@projectproject/shared"
import { deleteStatusAtom, projectKey } from "@/atoms/projectStatuses"
import { Button } from "@/components/ui/button"
import { statusLabelFor } from "@/lib/ticket-meta"
import { m } from "@/paraglide/messages"

type Props = {
  status: ProjectStatus
  statuses: ReadonlyArray<ProjectStatus>
  affectedCount: number
  orgSlug: string
  slug: string
  onDone: () => void
}

export function StatusDeleteForm({
  status,
  statuses,
  affectedCount,
  orgSlug,
  slug,
  onDone
}: Props) {
  const key = projectKey(orgSlug, slug)
  const remove = useAtomSet(deleteStatusAtom(key))
  const targets = statuses.filter((s) => s.slug !== status.slug)
  const [target, setTarget] = useState<string>(targets[0]?.slug ?? "")

  const submit = () => {
    remove({
      statusSlug: status.slug,
      reassignTo: affectedCount > 0 ? (target as StatusSlug) : undefined
    })
    onDone()
  }

  if (affectedCount === 0) {
    return (
      <div className="flex items-center gap-3 rounded-md border border-destructive/40 bg-destructive/5 p-2 text-sm">
        <span>{m.tickets_status_delete_confirm_empty()}</span>
        <div className="ml-auto flex gap-2">
          <Button variant="tertiary" onClick={onDone} size="sm">
            {m.tickets_status_delete_cancel()}
          </Button>
          <Button variant="destructive" onClick={submit} size="sm">
            {m.tickets_status_delete_button()}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-3 rounded-md border border-destructive/40 bg-destructive/5 p-2 text-sm">
      <span>
        {m.tickets_status_delete_confirm_with_tickets({ count: affectedCount })}
      </span>
      <select
        value={target}
        onChange={(e) => setTarget(e.target.value)}
        className="rounded-md border border-input bg-background px-2 py-1 text-sm"
      >
        {targets.map((s) => {
          const label = statusLabelFor(s.slug, statuses)
          return (
            <option key={s.slug} value={s.slug}>
              {label}
            </option>
          )
        })}
      </select>
      <div className="ml-auto flex gap-2">
        <Button variant="tertiary" onClick={onDone} size="sm">
          {m.tickets_status_delete_cancel()}
        </Button>
        <Button variant="destructive" onClick={submit} size="sm">
          {m.tickets_status_delete_button()}
        </Button>
      </div>
    </div>
  )
}
