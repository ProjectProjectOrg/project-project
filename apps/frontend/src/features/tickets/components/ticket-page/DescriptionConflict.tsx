import { useAtomValue } from "@effect/atom-react"
import type { User } from "@pp/shared"
import * as Result from "effect/reactivity/AsyncResult"
import { TriangleAlert } from "lucide-react"

import { Button } from "@/components/ui/button"
import { me } from "@/features/auth/atoms/auth"
import { m } from "@/paraglide/messages"

const headline = (changedBy: User | null, viewerId: string | null) => {
  if (changedBy === null) return m.tickets_description_changed_elsewhere()
  if (changedBy.id === viewerId) return m.tickets_description_changed_by_you()
  return m.tickets_description_changed_by({ name: changedBy.name })
}

export function DescriptionConflict({
  changedBy,
  onTakeTheirs,
  onKeepMine
}: Readonly<{
  changedBy: User | null
  onTakeTheirs: () => void
  onKeepMine: () => void
}>) {
  const viewer = useAtomValue(me())
  const viewerId = Result.isSuccess(viewer) ? viewer.value.id : null

  return (
    <output className="@container sticky top-0 z-10 -mx-3 -mt-2 mb-2 block animate-in overflow-hidden rounded-t-[15px] border-b border-state-warning/30 bg-background px-3 py-2.5 duration-200 fade-in-0 slide-in-from-top-1 motion-reduce:animate-none">
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-state-warning/10"
      />
      <span className="relative flex items-start gap-3">
        <TriangleAlert
          aria-hidden
          className="mt-0.5 size-4 shrink-0 text-state-warning"
        />
        <span className="flex min-w-0 flex-1 flex-col gap-2 @2xl:flex-row @2xl:items-center @2xl:gap-3">
          <span className="min-w-0 flex-1 text-[13px] text-pretty">
            <span className="block font-medium text-foreground">
              {headline(changedBy, viewerId)}
            </span>
            <span className="block text-muted-foreground">
              {m.tickets_description_unsaved()}
            </span>
          </span>
          <span className="flex flex-wrap justify-end gap-2 @2xl:shrink-0">
            <Button variant="secondary" size="sm" onClick={onTakeTheirs}>
              {m.tickets_description_use_theirs()}
            </Button>
            <Button variant="secondary" size="sm" onClick={onKeepMine}>
              {m.tickets_description_keep_mine()}
            </Button>
          </span>
        </span>
      </span>
    </output>
  )
}
