import * as Result from "effect/unstable/reactivity/AsyncResult"
import * as Atom from "effect/unstable/reactivity/Atom"
import { useAtomSet, useAtomValue } from "@effect/atom-react"
import * as Cause from "effect/Cause"
import * as Exit from "effect/Exit"
import * as Schema from "effect/Schema"
import { Check, Plus, X } from "lucide-react"
import { useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { TagChip } from "@/components/TagChip"
import { TagAdminPopover } from "@/components/TagAdminPopover"
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from "@/components/ui/popover"
import {
  createTag,
  deleteTag,
  tagsFor,
  tagsRequest,
  tagUsage,
  updateTag,
  type TagsRequest
} from "@/atoms/tags"
import { ticketRequest, updateTicketDetail } from "@/atoms/ticketDetail"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"
import { TagName, type Tag, type TicketDetail } from "@projectproject/shared"

type Props = {
  orgSlug: string
  slug: string
  ticket: TicketDetail
  canManageTags: boolean
}

const VALID = /^[a-z0-9][a-z0-9 -]{0,30}$/
const NEUTRAL = "#94a3b8"
const makeTagName = Schema.decodeUnknownSync(TagName)
const idleUsageCountsAtom = Atom.make(Result.initial<Record<string, number>>())

export function TagEditor({ orgSlug, slug, ticket, canManageTags }: Props) {
  const tagsReq = useMemo(() => tagsRequest(orgSlug, slug), [orgSlug, slug])
  const tagsResult = useAtomValue(tagsFor(tagsReq))
  const [managedTag, setManagedTag] = useState<string | null>(null)
  const usageResult = useAtomValue(
    canManageTags && managedTag !== null
      ? tagUsage(tagsReq)
      : idleUsageCountsAtom
  )
  const req = useMemo(
    () => ticketRequest(orgSlug, slug, ticket.id),
    [orgSlug, slug, ticket.id]
  )
  const updateTicket = useAtomSet(updateTicketDetail(req))
  const create = useAtomSet(createTag(tagsReq), { mode: "promiseExit" })
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState("")

  const registry = useMemo<ReadonlyArray<Tag>>(
    () => (Result.isSuccess(tagsResult) ? tagsResult.value : []),
    [tagsResult]
  )
  const displayed: ReadonlyArray<string> = ticket.tags

  const tagByName = useMemo(() => {
    const map = new Map<string, Tag>()
    for (const t of registry) map.set(t.name, t)
    return map
  }, [registry])

  const lowered = draft.trim().toLowerCase()
  const exactRegistered = registry.find((t) => t.name === lowered)
  const isValidNewName = VALID.test(lowered)
  const showEmpty =
    Result.isSuccess(tagsResult) &&
    registry.length === 0 &&
    lowered.length === 0
  const showValidationError =
    canManageTags && lowered.length > 0 && !exactRegistered && !isValidNewName
  const filtered = lowered
    ? registry.filter((t) => t.name.includes(lowered))
    : registry

  const apply = (next: ReadonlyArray<string>) =>
    updateTicket({ tags: next.map((name) => makeTagName(name)) })

  const addTag = (name: string) => {
    if (displayed.includes(name)) return
    apply([...ticket.tags, name])
    setDraft("")
    setOpen(false)
  }

  const removeFromTicket = (name: string) => {
    apply(ticket.tags.filter((t) => t !== name))
  }

  const createAndApply = async () => {
    if (!isValidNewName || exactRegistered) return
    const name = lowered
    const exit = await create({ name: makeTagName(name) })
    if (Exit.isSuccess(exit)) addTag(name)
  }

  const ticketHasTag = (name: string) =>
    (ticket.tags as ReadonlyArray<string>).includes(name)

  const usageCountFor = (currentName: string) =>
    Result.isSuccess(usageResult)
      ? (usageResult.value[currentName as TagName] ?? 0)
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
            req={tagsReq}
            usageCount={tag ? usageCountFor(tag.name) : 0}
            onRemove={() => removeFromTicket(name)}
            onManagementOpenChange={(open) =>
              setManagedTag((current) =>
                open ? name : current === name ? null : current
              )
            }
          />
        )
      })}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button
              type="button"
              variant="tertiary"
              size={displayed.length === 0 ? "xs" : "icon-xs"}
              leadingIcon={displayed.length === 0 ? Plus : undefined}
              aria-label={m.tags_add_button()}
              className="border-dashed text-muted-foreground hover:border-foreground/40 hover:text-foreground"
            >
              {displayed.length === 0 ? (
                m.tags_add_button()
              ) : (
                <Plus strokeWidth={2} />
              )}
            </Button>
          }
        />
        <PopoverContent
          align="start"
          sideOffset={6}
          className="w-60 p-1"
          initialFocus={true}
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
                  else if (canManageTags) void createAndApply()
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
              placeholder={m.tags_search_or_create_placeholder()}
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
                {m.tags_name_validation_hint()}
              </p>
            ) : null}
            <div className="flex max-h-56 flex-col gap-0.5 overflow-y-auto">
              {showEmpty ? (
                <div className="flex min-h-16 flex-col items-center justify-center px-3 py-2 text-center">
                  <p className="text-xs font-medium">{m.tags_empty_title()}</p>
                  {canManageTags ? (
                    <p className="text-[11px] text-muted-foreground">
                      {m.tags_empty_create_hint()}
                    </p>
                  ) : null}
                </div>
              ) : null}
              {!showEmpty && filtered.length === 0 && !canManageTags ? (
                <p className="px-2 py-1 text-[11px] text-muted-foreground">
                  {m.tags_no_matches()}
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
                  onClick={() => void createAndApply()}
                  className="flex items-center gap-2 rounded-sm px-1.5 py-1 text-left text-xs text-muted-foreground transition-colors duration-100 hover:bg-accent hover:text-foreground active:scale-[0.99]"
                >
                  <Plus className="size-3.5" strokeWidth={2} />
                  {m.tags_create_button({ name: lowered })}
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
  req,
  usageCount,
  onRemove,
  onManagementOpenChange
}: {
  name: string
  tag: Tag | undefined
  color: string | null
  canManage: boolean
  req: TagsRequest
  usageCount: number
  onRemove: () => void
  onManagementOpenChange: (open: boolean) => void
}) {
  const tagName = makeTagName(name)
  const updateMutation = updateTag({ req, name: tagName })
  const removeMutation = deleteTag({ req, name: tagName })
  const update = useAtomSet(updateMutation)
  const updateState = useAtomValue(updateMutation)
  const remove = useAtomSet(removeMutation, { mode: "promiseExit" })
  const removeState = useAtomValue(removeMutation)
  const waiting = updateState.waiting || removeState.waiting
  const patch = (next: { nextName?: TagName; color?: Tag["color"] }) =>
    update({ name: next.nextName, color: next.color })
  const removeTag = async () => {
    const exit = await remove()
    if (Exit.isFailure(exit)) throw Cause.squash(exit.cause)
  }
  const hex = color ?? NEUTRAL
  const wrapperClass = cn(
    "inline-flex h-5 w-fit shrink-0 items-center gap-1 rounded-md whitespace-nowrap font-medium text-[11px] transition-colors",
    waiting && "animate-pulse"
  )
  const wrapperStyle = { backgroundColor: `${hex}1a`, color: hex }
  const removeButton = (
    <button
      type="button"
      aria-label={m.tags_remove_aria_label({ name })}
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
        onPatch={patch}
        onDelete={removeTag}
        onOpenChange={onManagementOpenChange}
      >
        <button
          type="button"
          aria-label={m.tags_edit_aria_label({ name })}
          className="-ml-0.5 cursor-pointer rounded transition-transform duration-100 active:scale-[0.97]"
        >
          {name}
        </button>
      </TagAdminPopover>
      {removeButton}
    </span>
  )
}
