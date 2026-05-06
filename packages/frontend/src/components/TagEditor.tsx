import { Result, useAtomSet, useAtomValue } from "@effect-atom/atom-react"
import { Check, Plus } from "lucide-react"
import { useMemo, useState } from "react"
import { TagChip } from "@/components/TagChip"
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from "@/components/ui/popover"
import { createTagAtom, tagsAtom, tagsKey } from "@/atoms/tags"
import { updateTicketAtom } from "@/atoms/tickets"
import { cn } from "@/lib/utils"
import type { TagName, TicketDetail } from "@projectproject/shared"

type Props = {
  orgSlug: string
  slug: string
  ticket: TicketDetail
  canManageTags: boolean
}

const VALID = /^[a-z0-9][a-z0-9-]{0,30}$/

export function TagEditor({ orgSlug, slug, ticket, canManageTags }: Props) {
  const key = tagsKey(orgSlug, slug)
  const tagsResult = useAtomValue(tagsAtom(key))
  const updateTicket = useAtomSet(updateTicketAtom)
  const createTag = useAtomSet(createTagAtom(key))
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState("")

  const registry = Result.isSuccess(tagsResult) ? tagsResult.value : []
  const colorByName = useMemo(() => {
    const map = new Map<string, string>()
    for (const t of registry) map.set(t.name, t.color)
    return map
  }, [registry])

  const applied = ticket.tags
  const lowered = draft.trim().toLowerCase()
  const exactRegistered = registry.find((t) => t.name === lowered)
  const isValidNewName = VALID.test(lowered)
  const filtered = lowered
    ? registry.filter((t) => t.name.includes(lowered))
    : registry

  const apply = (next: ReadonlyArray<string>) =>
    updateTicket({
      orgSlug,
      slug,
      id: ticket.id,
      tags: next as unknown as ReadonlyArray<TagName>
    })

  const addTag = (name: string) => {
    if ((applied as ReadonlyArray<string>).includes(name)) return
    apply([...applied, name])
    setDraft("")
    setOpen(false)
  }

  const removeTag = (name: string) => {
    apply(applied.filter((t) => t !== name))
  }

  const createAndApply = () => {
    if (!isValidNewName || exactRegistered) return
    Promise.resolve(createTag({ name: lowered as TagName })).then(() =>
      addTag(lowered)
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {applied.map((name) => (
        <TagChip
          key={name}
          name={name}
          color={colorByName.get(name) ?? null}
          onRemove={() => removeTag(name)}
        />
      ))}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label="Add tag"
            className="inline-flex h-6 items-center gap-1 rounded-md border border-dashed border-border px-1.5 text-[11px] text-muted-foreground transition-colors duration-100 hover:border-foreground/40 hover:text-foreground active:scale-[0.97]"
          >
            <Plus className="size-3" strokeWidth={2} />
            {applied.length === 0 ? "Add tag" : null}
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          sideOffset={6}
          className="w-60 p-1"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <div className="flex flex-col gap-1">
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value.toLowerCase())}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  if (exactRegistered) addTag(exactRegistered.name)
                  else if (canManageTags) createAndApply()
                }
                if (e.key === "Escape") {
                  e.preventDefault()
                  setOpen(false)
                }
              }}
              placeholder="Search or create..."
              className="h-7 rounded-md border border-border bg-transparent px-2 text-xs outline-none focus-visible:border-foreground/40"
            />
            <div className="flex max-h-56 flex-col gap-0.5 overflow-y-auto">
              {filtered.length === 0 && !canManageTags ? (
                <p className="px-2 py-1 text-[11px] text-muted-foreground">
                  No tags match.
                </p>
              ) : null}
              {filtered.map((tag) => {
                const isApplied = (applied as ReadonlyArray<string>).includes(
                  tag.name
                )
                return (
                  <button
                    key={tag.name}
                    type="button"
                    onClick={() =>
                      isApplied ? removeTag(tag.name) : addTag(tag.name)
                    }
                    className={cn(
                      "flex items-center gap-2 rounded-sm px-1.5 py-1 text-left text-xs transition-colors duration-100 hover:bg-accent active:scale-[0.99]"
                    )}
                  >
                    <TagChip name={tag.name} color={tag.color} size="xs" />
                    {isApplied ? (
                      <Check className="ml-auto size-3.5 text-muted-foreground" />
                    ) : null}
                  </button>
                )
              })}
              {canManageTags &&
              lowered &&
              !exactRegistered &&
              isValidNewName ? (
                <button
                  type="button"
                  onClick={createAndApply}
                  className="flex items-center gap-2 rounded-sm px-1.5 py-1 text-left text-xs text-muted-foreground transition-colors duration-100 hover:bg-accent hover:text-foreground active:scale-[0.99]"
                >
                  <Plus className="size-3.5" strokeWidth={2} />
                  Create tag '{lowered}'
                </button>
              ) : null}
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}
