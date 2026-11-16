import type { MergeConflict } from "@pp/local"
import { TriangleAlert } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

export function DescriptionConflict({
  conflicts,
  takeTheirs,
  keepMine
}: Readonly<{
  conflicts: ReadonlyArray<MergeConflict>
  takeTheirs: () => void
  keepMine: () => void
}>) {
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
          <span className="min-w-0 flex-1 text-caption text-pretty">
            <span className="block font-semibold text-foreground">
              {m.tickets_description_changed_elsewhere()}
            </span>
            <span className="block text-muted-foreground">
              {m.tickets_description_unsaved()}
            </span>
            {conflicts.length > 0 && <ConflictLines conflicts={conflicts} />}
          </span>
          <span className="flex flex-wrap justify-end gap-2 @2xl:shrink-0">
            <Button variant="secondary" size="sm" onClick={takeTheirs}>
              {m.tickets_description_use_theirs()}
            </Button>
            <Button variant="secondary" size="sm" onClick={keepMine}>
              {m.tickets_description_keep_mine()}
            </Button>
          </span>
        </span>
      </span>
    </output>
  )
}

function ConflictLines({
  conflicts
}: Readonly<{ conflicts: ReadonlyArray<MergeConflict> }>) {
  return (
    <span className="mt-2 flex max-h-40 flex-col gap-1.5 overflow-y-auto">
      {conflicts.map((conflict) => {
        const removed = conflict.theirs.length === 0
        return (
          <span key={conflict.line} className="flex flex-col gap-0.5">
            <span className="text-micro text-muted-foreground">
              {removed
                ? m.tickets_description_conflict_removed()
                : m.tickets_description_conflict_lines()}
            </span>
            <span
              className={cn(
                "block rounded-md bg-muted px-2 py-1 whitespace-pre-wrap text-foreground",
                removed && "text-muted-foreground line-through"
              )}
            >
              {(removed ? conflict.base : conflict.theirs).join("\n")}
            </span>
          </span>
        )
      })}
    </span>
  )
}
