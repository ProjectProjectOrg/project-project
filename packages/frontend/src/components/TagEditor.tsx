import { Result, useAtomSet, useAtomValue } from "@effect-atom/atom-react"
import { Check, Plus, X } from "lucide-react"
import { useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
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
import {
  ticketKey,
  ticketsListAtom,
  ticketsListKey,
  updateTicketAtom,
  type TicketConflict
} from "@/atoms/tickets"
import { cn } from "@/lib/utils"
import type { Tag, TagName, TicketDetail } from "@projectproject/shared"

type Props = {
  orgSlug: string
  slug: string
  ticket: TicketDetail
  canManageTags: boolean
  onConflict?: (info: TicketConflict) => void
}

const VALID = /^[a-z0-9][a-z0-9 -]{0,30}$/
const VALIDATION_HINT =
  "Use lowercase letters, digits, spaces or hyphens. Start with a letter or digit. Max 31 characters."
const NEUTRAL = "#94a3b8"

export function TagEditor({
  orgSlug,
  slug,
  ticket,
  canManageTags,
  onConflict
}: Props) {
  const key = tagsKey(orgSlug, slug)
  const tagsResult = useAtomValue(tagsAtom(key))
  const ticketsResult = useAtomValue(
    ticketsListAtom(ticketsListKey(orgSlug, slug))
  )
  const updateTicket = useAtomSet(
    updateTicketAtom(ticketKey(orgSlug, slug, ticket.id)),
    { mode: "promise" }
  )
  const createTag = useAtomSet(createTagAtom(key))
  const renameTag = useAtomSet(renameTagAtom(key))
  const deleteTag = useAtomSet(deleteTagAtom(key))
  const {
    renameMap,
    removed,
    registerRename,
    registerRemove,
    unregisterRemove
  } = useTagRenames(orgSlug, slug)
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
  const showValidationError =
    canManageTags && lowered.length > 0 && !exactRegistered && !isValidNewName
  const filtered = lowered
    ? registry.filter((t) => t.name.includes(lowered))
    : registry

  const apply = async (next: ReadonlyArray<string>) => {
    const result = await updateTicket({
      baseVersion: ticket.version,
      tags: next as unknown as ReadonlyArray<TagName>
    })
    if (result._tag === "Conflict") onConflict?.(result.conflict)
  }

  const addTag = (name: string) => {
    if (displayed.includes(name)) return
    void apply([...ticket.tags.filter((t) => !removed.has(t)), name])
    setDraft("")
    setOpen(false)
  }

  const removeFromTicket = (name: string) => {
    void apply(ticket.tags.filter((t) => t !== name))
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
      await deleteTag({ name: name as TagName })
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
          <Button
            type="button"
            variant="tertiary"
            size={displayed.length === 0 ? "xs" : "icon-xs"}
            leadingIcon={displayed.length === 0 ? Plus : undefined}
            aria-label="Add tag"
            className="border-dashed text-muted-foreground hover:border-foreground/40 hover:text-foreground"
          >
            {displayed.length === 0 ? "Add tag" : <Plus strokeWidth={2} />}
          </Button>
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
              aria-invalid={showValidationError || undefined}
              aria-describedby={
                showValidationError ? "tag-name-error" : undefined
              }
              placeholder="Search or create..."
              className={cn(
                "h-7 rounded-md border bg-transparent px-2 text-xs outline-none transition-colors",
                showValidationError
                  ? "border-destructive/60 focus-visible:border-destructive"
                  : "border-border focus-visible:border-foreground/40"
              )}
            />
            {showValidationError ? (
              <p
                id="tag-name-error"
                className="px-1 text-[11px] leading-tight text-destructive"
              >
                {VALIDATION_HINT}
              </p>
            ) : null}
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
                      isApplied ? removeFromTicket(tag.name) : addTag(tag.name)
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
    "inline-flex h-5 w-fit shrink-0 items-center gap-1 rounded-md whitespace-nowrap font-medium text-[11px] transition-colors",
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
      className="inline-grid size-3.5 place-items-center rounded-full bg-transparent transition-colors duration-100 hover:bg-black/15 active:scale-[0.9] dark:hover:bg-white/20"
    >
      <X className="size-2.5" strokeWidth={2.25} />
    </button>
  )

  if (!canManage || !tag) {
    return (
      <span
        data-slot="tag-chip"
        className={cn(wrapperClass, "pl-1.5 pr-1")}
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
      className={cn(wrapperClass, "pl-1.5 pr-1")}
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
