import { useAtomSet, useAtomValue } from "@effect/atom-react"
import { TagName, type Tag, type TicketDetail } from "@pp/shared"
import * as Cause from "effect/Cause"
import * as Exit from "effect/Exit"
import * as Schema from "effect/Schema"
import * as Result from "effect/unstable/reactivity/AsyncResult"
import * as Atom from "effect/unstable/reactivity/Atom"
import { Plus, X } from "lucide-react"
import { useMemo, useState } from "react"

import { TagAdminPopover } from "@/components/TagAdminPopover"
import { TagChip } from "@/components/TagChip"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuEmpty,
  DropdownMenuInput,
  DropdownMenuItem,
  DropdownMenuList,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import {
  applyTagsInEditor,
  createTagInEditor,
  deleteTagInEditor,
  tagEditor,
  tagEditorRequest,
  tagsRequest,
  tagUsage,
  updateTagInEditor,
  type TagEditorRequest
} from "@/features/tags/atoms/tags"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

type Props = {
  orgSlug: string
  slug: string
  ticket: TicketDetail
  canManageTags: boolean
}

const VALID = /^[a-z0-9][a-z0-9 -]{0,30}$/
const NEUTRAL = "#94a3b8"
const makeTagName = Schema.decodeUnknownSync(TagName)
const matchesTag = (text: string, query: string) =>
  text.includes(query.toLowerCase())
const idleUsageCountsAtom = Atom.make(Result.initial<Record<string, number>>())

export function TagEditor({ orgSlug, slug, ticket, canManageTags }: Props) {
  const tagsReq = useMemo(() => tagsRequest(orgSlug, slug), [orgSlug, slug])
  const editorReq = useMemo(
    () => tagEditorRequest(orgSlug, slug, ticket.id),
    [orgSlug, slug, ticket.id]
  )
  const editorResult = useAtomValue(tagEditor(editorReq))
  const [managedTag, setManagedTag] = useState<string | null>(null)
  const usageResult = useAtomValue(
    canManageTags && managedTag !== null
      ? tagUsage(tagsReq)
      : idleUsageCountsAtom
  )
  const updateTags = useAtomSet(applyTagsInEditor(editorReq))
  const create = useAtomSet(createTagInEditor(editorReq), {
    mode: "promiseExit"
  })
  const [draft, setDraft] = useState("")

  const registry = useMemo<ReadonlyArray<Tag>>(
    () => (Result.isSuccess(editorResult) ? editorResult.value.tags : []),
    [editorResult]
  )
  const displayed = Result.isSuccess(editorResult)
    ? editorResult.value.applied
    : ticket.tags.map((name) => ({ key: name, name }))
  const displayedNames = displayed.map((tag) => tag.name)

  const tagByName = useMemo(() => {
    const map = new Map<string, Tag>()
    for (const t of registry) map.set(t.name, t)
    return map
  }, [registry])

  const lowered = draft.trim().toLowerCase()
  const exactRegistered = registry.find((t) => t.name === lowered)
  const isValidNewName = VALID.test(lowered)
  const showEmpty =
    Result.isSuccess(editorResult) &&
    registry.length === 0 &&
    lowered.length === 0
  const showValidationError =
    canManageTags && lowered.length > 0 && !exactRegistered && !isValidNewName
  const canCreate =
    canManageTags && lowered.length > 0 && !exactRegistered && isValidNewName
  const ordered = exactRegistered
    ? [exactRegistered, ...registry.filter((t) => t !== exactRegistered)]
    : registry

  const apply = (next: ReadonlyArray<string>) =>
    updateTags({ tags: next.map((name) => makeTagName(name)) })

  const addTag = (name: string) => {
    if (displayedNames.includes(makeTagName(name))) return
    apply([...displayedNames, name])
  }

  const removeFromTicket = (name: string) => {
    apply(displayedNames.filter((tagName) => tagName !== name))
  }

  const createAndApply = async () => {
    if (!isValidNewName || exactRegistered) return
    const name = lowered
    const exit = await create({ name: makeTagName(name) })
    if (Exit.isSuccess(exit)) addTag(name)
  }

  const ticketHasTag = (name: string) =>
    (displayedNames as ReadonlyArray<string>).includes(name)

  const usageCountFor = (currentName: string) =>
    Result.isSuccess(usageResult)
      ? (usageResult.value[currentName as TagName] ?? 0)
      : ticketHasTag(currentName)
        ? 1
        : 0

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {displayed.map(({ key, name }) => {
        const tag = tagByName.get(name)
        return (
          <AppliedTagChip
            key={key}
            name={name}
            mutationName={key}
            tag={tag}
            color={tag?.color ?? null}
            canManage={canManageTags}
            req={editorReq}
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
      <DropdownMenu
        filterable={{
          value: draft,
          onValueChange: (next) => setDraft(next.toLowerCase()),
          filter: matchesTag
        }}
      >
        <DropdownMenuTrigger
          render={
            <Button
              type="button"
              variant="chip"
              aria-label={m.tags_add_button()}
            >
              <Plus className="size-3.5" strokeWidth={1.75} />
              {displayedNames.length === 0 ? (
                <span>{m.tags_add_button()}</span>
              ) : null}
            </Button>
          }
        />
        <DropdownMenuContent align="start" sideOffset={6} className="w-60">
          <DropdownMenuInput
            placeholder={m.tags_search_or_create_placeholder()}
            aria-label={m.tags_search_or_create_placeholder()}
            aria-invalid={showValidationError || undefined}
            aria-describedby={
              showValidationError ? "tag-name-error" : undefined
            }
          />
          {showValidationError ? (
            <p
              id="tag-name-error"
              className="px-2 pb-1 text-[11px] leading-tight text-destructive"
            >
              {m.tags_name_validation_hint()}
            </p>
          ) : null}
          {showEmpty ? (
            <div className="flex min-h-16 flex-col items-center justify-center px-3 py-2 text-center">
              <p className="text-[13px] font-medium">{m.tags_empty_title()}</p>
              {canManageTags ? (
                <p className="text-xs text-muted-foreground">
                  {m.tags_empty_create_hint()}
                </p>
              ) : null}
            </div>
          ) : null}
          <DropdownMenuList className="max-h-56 overflow-y-auto">
            {ordered.map((tag) => {
              const isApplied = ticketHasTag(tag.name)
              return (
                <DropdownMenuCheckboxItem
                  key={tag.name}
                  label={tag.name}
                  checked={isApplied}
                  closeOnClick={!isApplied}
                  onCheckedChange={() =>
                    isApplied ? removeFromTicket(tag.name) : addTag(tag.name)
                  }
                >
                  <TagChip name={tag.name} color={tag.color} size="xs" />
                </DropdownMenuCheckboxItem>
              )
            })}
            {canCreate ? (
              <DropdownMenuItem
                label={lowered}
                onClick={() => void createAndApply()}
              >
                <Plus strokeWidth={1.75} />
                {m.tags_create_button({ name: lowered })}
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuList>
          {canManageTags || showEmpty ? null : (
            <DropdownMenuEmpty>{m.tags_no_matches()}</DropdownMenuEmpty>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

function AppliedTagChip({
  name,
  mutationName,
  tag,
  color,
  canManage,
  req,
  usageCount,
  onRemove,
  onManagementOpenChange
}: {
  name: string
  mutationName: TagName
  tag: Tag | undefined
  color: string | null
  canManage: boolean
  req: TagEditorRequest
  usageCount: number
  onRemove: () => void
  onManagementOpenChange: (open: boolean) => void
}) {
  const updateMutation = updateTagInEditor({ req, name: mutationName })
  const removeMutation = deleteTagInEditor({ req, name: mutationName })
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
    "inline-flex h-5 w-fit shrink-0 items-center gap-1 rounded-md text-[11px] font-medium whitespace-nowrap transition-colors",
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
        className={cn(wrapperClass, "pr-1 pl-1.5")}
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
      className={cn(wrapperClass, "pr-1 pl-1.5")}
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
