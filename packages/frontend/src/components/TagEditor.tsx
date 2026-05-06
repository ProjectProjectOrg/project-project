import { Result, useAtomSet, useAtomValue } from "@effect-atom/atom-react"
import { Check, Plus, X } from "lucide-react"
import { useMemo, useState } from "react"
import { TagChip } from "@/components/TagChip"
import { TagAdminPopover } from "@/components/TagAdminPopover"
import { useTagRenames } from "@/components/TagRenamesProvider"
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from "@/components/ui/popover"
import {
  createTagAtom,
  deleteTagAtom,
  renameTagAtom,
  tagsAtom,
  tagsKey
} from "@/atoms/tags"
import { ticketsListAtom, ticketsListKey } from "@/atoms/tickets"
import { updateTicketAtom } from "@/atoms/tickets"
import { cn } from "@/lib/utils"
import type { Tag, TagName, TicketDetail } from "@projectproject/shared"

type Props = {
  orgSlug: string
  slug: string
  ticket: TicketDetail
  canManageTags: boolean
}

const VALID = /^[a-z0-9][a-z0-9-]{0,30}$/
const NEUTRAL = "#94a3b8"

export function TagEditor({ orgSlug, slug, ticket, canManageTags }: Props) {
  const key = tagsKey(orgSlug, slug)
  const tagsResult = useAtomValue(tagsAtom(key))
  const ticketsResult = useAtomValue(
    ticketsListAtom(ticketsListKey(orgSlug, slug))
  )
  const updateTicket = useAtomSet(updateTicketAtom)
  const createTag = useAtomSet(createTagAtom(key))
  const renameTag = useAtomSet(renameTagAtom(key))
  const deleteTag = useAtomSet(deleteTagAtom(key))
  const { renameMap, removed, registerRename, registerRemove, unregisterRemove } =
    useTagRenames(orgSlug, slug)
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState("")

  const registry = Result.isSuccess(tagsResult) ? tagsResult.value : []
  const registryWaiting = Result.isSuccess(tagsResult) && tagsResult.waiting
  const registryNames = useMemo(
    () => new Set<string>(registry.map((t) => t.name as string)),
    [registry]
  )

  const mapName = (name: string) => {
    const renamed = renameMap.get(name)
    if (!renamed) return name
    if (registryNames.has(name)) return name
    return renamed
  }

  const displayed = useMemo(
    () =>
      ticket.tags
        .map(mapName)
        .filter((name) => !(removed.has(name) && !registryNames.has(name))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ticket.tags, renameMap, removed, registryNames]
  )

  const tagByName = useMemo(() => {
    const map = new Map<string, Tag>()
    for (const t of registry) map.set(t.name, t)
    return map
  }, [registry])

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
    if (displayed.includes(name)) return
    apply([...ticket.tags.filter((t) => !removed.has(t)), name])
    setDraft("")
    setOpen(false)
  }

  const removeFromTicket = (name: string) => {
    apply(ticket.tags.filter((t) => t !== name))
  }

  const createAndApply = () => {
    if (!isValidNewName || exactRegistered) return
    Promise.resolve(createTag({ name: lowered as TagName })).then(() =>
      addTag(lowered)
    )
  }

  const ticketHasTag = (name: string) =>
    (ticket.tags as ReadonlyArray<string>).includes(name)

  const handlePatch = (
    oldName: string,
    patch: { nextName?: TagName; color?: Tag["color"] }
  ) => {
    if (patch.nextName && patch.nextName !== oldName) {
      registerRename(oldName, patch.nextName)
    }
    void renameTag({
      oldName: oldName as TagName,
      nextName: patch.nextName,
      color: patch.color
    })
  }

  const handleDelete = async (name: string) => {
    registerRemove(name)
    try {
      await deleteTag({ name: name as TagName, force: true })
    } catch (e) {
      unregisterRemove(name)
      throw e
    }
  }

  const usageCountFor = (currentName: string) =>
    Result.isSuccess(ticketsResult)
      ? ticketsResult.value.reduce((n, t) => {
          const mapped = (t.tags as ReadonlyArray<string>).map(mapName)
          return n + (mapped.includes(currentName) ? 1 : 0)
        }, 0)
      : ticketHasTag(currentName)
        ? 1
        : 0

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {displayed.map((name, i) => {
        const tag = tagByName.get(name)
        return (
          <AppliedTagChip
            key={i}
            name={name}
            tag={tag}
            color={tag?.color ?? null}
            canManage={canManageTags}
            waiting={registryWaiting}
            usageCount={tag ? usageCountFor(tag.name) : 0}
            onPatch={(patch) => handlePatch(name, patch)}
            onDelete={() => handleDelete(name)}
            onRemove={() => removeFromTicket(name)}
          />
        )
      })}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label="Add tag"
            className="inline-flex h-6 items-center gap-1 rounded-md border border-dashed border-border px-1.5 text-[11px] text-muted-foreground transition-colors duration-100 hover:border-foreground/40 hover:text-foreground active:scale-[0.97]"
          >
            <Plus className="size-3" strokeWidth={2} />
            {displayed.length === 0 ? "Add tag" : null}
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
                const isApplied = displayed.includes(tag.name)
                return (
                  <button
                    key={tag.name}
                    type="button"
                    onClick={() =>
                      isApplied
                        ? removeFromTicket(tag.name)
                        : addTag(tag.name)
                    }
                    className="flex items-center gap-2 rounded-sm px-1.5 py-1 text-left text-xs transition-colors duration-100 hover:bg-accent active:scale-[0.99]"
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

function AppliedTagChip({
  name,
  tag,
  color,
  canManage,
  waiting,
  usageCount,
  onPatch,
  onDelete,
  onRemove
}: {
  name: string
  tag: Tag | undefined
  color: string | null
  canManage: boolean
  waiting: boolean
  usageCount: number
  onPatch: (patch: { nextName?: TagName; color?: Tag["color"] }) => void
  onDelete: () => Promise<void> | void
  onRemove: () => void
}) {
  const hex = color ?? NEUTRAL
  const wrapperClass = cn(
    "inline-flex h-6 w-fit shrink-0 items-center gap-1 rounded-md whitespace-nowrap font-medium text-xs transition-colors",
    waiting && "animate-pulse"
  )
  const wrapperStyle = { backgroundColor: `${hex}1a`, color: hex }
  const removeButton = (
    <button
      type="button"
      aria-label={`Remove tag ${name}`}
      onClick={(e) => {
        e.stopPropagation()
        onRemove()
      }}
      className="inline-flex size-4 items-center justify-center rounded transition-colors duration-100 hover:bg-black/10 active:scale-[0.97]"
    >
      <X className="size-3" />
    </button>
  )

  if (!canManage || !tag) {
    return (
      <span
        data-slot="tag-chip"
        className={cn(wrapperClass, "px-2 py-0.5 pr-1.5")}
        style={wrapperStyle}
      >
        {name}
        {removeButton}
      </span>
    )
  }

  return (
    <span
      data-slot="tag-chip"
      className={cn(wrapperClass, "pl-2 pr-1.5 py-0.5")}
      style={wrapperStyle}
    >
      <TagAdminPopover
        tag={tag}
        usageCount={usageCount}
        onPatch={onPatch}
        onDelete={onDelete}
      >
        <button
          type="button"
          aria-label={`Edit tag ${name}`}
          className="-ml-0.5 cursor-pointer rounded transition-transform duration-100 active:scale-[0.97]"
        >
          {name}
        </button>
      </TagAdminPopover>
      {removeButton}
    </span>
  )
}
