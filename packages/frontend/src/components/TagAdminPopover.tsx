import { useAtomSet, useAtomValue, Result } from "@effect-atom/atom-react"
import { Trash2 } from "lucide-react"
import { useState } from "react"
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from "@/components/ui/popover"
import { deleteTagAtom, renameTagAtom, tagsAtom, tagsKey } from "@/atoms/tags"
import { ticketsListAtom, ticketsListKey } from "@/atoms/tickets"
import { cn } from "@/lib/utils"
import type { Tag, TagName } from "@projectproject/shared"

const VALID = /^[a-z0-9][a-z0-9-]{0,30}$/

type Props = {
  orgSlug: string
  slug: string
  tagName: string
  children: React.ReactNode
}

export function TagAdminPopover({ orgSlug, slug, tagName, children }: Props) {
  const key = tagsKey(orgSlug, slug)
  const tags = useAtomValue(tagsAtom(key))
  const tickets = useAtomValue(ticketsListAtom(ticketsListKey(orgSlug, slug)))
  const rename = useAtomSet(renameTagAtom(key))
  const remove = useAtomSet(deleteTagAtom(key))

  const tag = Result.isSuccess(tags)
    ? tags.value.find((t) => t.name === tagName)
    : undefined

  const [open, setOpen] = useState(false)
  const [draftName, setDraftName] = useState(tagName)
  const [pendingDelete, setPendingDelete] = useState<{
    usages: { ticketId: string; title: string }[]
  } | null>(null)

  if (!tag) return <>{children}</>

  const usageCount = Result.isSuccess(tickets)
    ? tickets.value.reduce(
        (n, t) => n + (t.tags.includes(tag.name) ? 1 : 0),
        0
      )
    : 0

  const onOpenChange = (next: boolean) => {
    setOpen(next)
    if (next) {
      setDraftName(tag.name)
      setPendingDelete(null)
    }
  }

  const commitRename = () => {
    const trimmed = draftName.trim()
    if (trimmed === tag.name || !VALID.test(trimmed)) return
    rename({ oldName: tag.name, nextName: trimmed as TagName })
  }

  const onDelete = async () => {
    try {
      await remove({ name: tag.name, force: false })
      setOpen(false)
    } catch (e: any) {
      if (e?._tag === "TagInUse") {
        setPendingDelete({ usages: e.usages })
      } else {
        throw e
      }
    }
  }

  const onForceDelete = async () => {
    await remove({ name: tag.name, force: true })
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={6}
        className="w-64 p-3"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {pendingDelete ? (
          <div className="flex flex-col gap-2 text-xs">
            <p>
              <strong>{tag.name}</strong> is applied to{" "}
              {pendingDelete.usages.length} ticket
              {pendingDelete.usages.length === 1 ? "" : "s"}:{" "}
              {pendingDelete.usages
                .map((u) => `${u.ticketId} ${u.title}`)
                .join(", ")}
              . Delete anyway? It will be stripped from every ticket.
            </p>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => void onForceDelete()}
                className="h-7 flex-1 rounded-md bg-destructive px-2 text-xs font-medium text-destructive-foreground transition-colors hover:bg-destructive/90"
              >
                Delete and strip
              </button>
              <button
                type="button"
                onClick={() => setPendingDelete(null)}
                className="h-7 rounded-md px-2 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <label className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground">Color</span>
              <input
                type="color"
                value={tag.color}
                onChange={(e) =>
                  rename({
                    oldName: tag.name,
                    color: e.target.value as Tag["color"]
                  })
                }
                className="size-6 cursor-pointer rounded border border-border bg-transparent p-0"
                aria-label={`Color for ${tag.name}`}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs">
              <span className="text-muted-foreground">Name</span>
              <input
                value={draftName}
                onChange={(e) => setDraftName(e.target.value.toLowerCase())}
                onBlur={commitRename}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault()
                    commitRename()
                  }
                  if (e.key === "Escape") {
                    setDraftName(tag.name)
                    setOpen(false)
                  }
                }}
                className="h-7 rounded-md border border-border bg-transparent px-2 text-xs outline-none focus-visible:border-foreground/40"
              />
            </label>
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span>
                Applied to {usageCount} ticket{usageCount === 1 ? "" : "s"}
              </span>
              <button
                type="button"
                onClick={() => void onDelete()}
                className={cn(
                  "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-destructive transition-colors duration-100 hover:bg-destructive/10 active:scale-[0.97]"
                )}
              >
                <Trash2 className="size-3" strokeWidth={1.75} />
                Delete tag
              </button>
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
