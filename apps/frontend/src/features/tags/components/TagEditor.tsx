import { useAtomSet, useAtomValue } from "@effect/atom-react"
import { TagName, type Tag, type TicketDetail } from "@pp/shared"
import * as Cause from "effect/Cause"
import * as Exit from "effect/Exit"
import * as Result from "effect/reactivity/AsyncResult"
import * as Atom from "effect/reactivity/Atom"
import * as Schema from "effect/Schema"
import { Plus, X } from "lucide-react"
import { useMemo, useRef, useState, type ComponentProps } from "react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import { useProjectRoute } from "@/features/projects/hooks/useProject"
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
import { TagAdminPopover } from "@/features/tags/components/TagAdminPopover"
import { TagMenuBody } from "@/features/tags/components/TagMenuBody"
import { mutationErrorText } from "@/lib/mutationError"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

type Props = {
  ticket: TicketDetail
  canManageTags: boolean
}

const NEUTRAL = "#94a3b8"
const makeTagName = Schema.decodeUnknownSync(TagName)
const idleUsageCountsAtom = Atom.make(Result.initial<Record<string, number>>())

export function TagEditor({ ticket, canManageTags }: Props) {
  const { orgSlug, slug } = useProjectRoute()
  const tagsReq = tagsRequest(orgSlug, slug)
  const editorReq = tagEditorRequest(orgSlug, slug, ticket.id)
  const editorResult = useAtomValue(tagEditor(editorReq))
  const [managedTag, setManagedTag] = useState<string | null>(null)
  const usageResult = useAtomValue(
    canManageTags && managedTag !== null
      ? tagUsage(tagsReq)
      : idleUsageCountsAtom
  )
  const updateTags = useAtomSet(applyTagsInEditor(editorReq), {
    mode: "promiseExit"
  })
  const create = useAtomSet(createTagInEditor(editorReq), {
    mode: "promiseExit"
  })
  const createState = useAtomValue(createTagInEditor(editorReq))
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [draft, setDraft] = useState("")
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [anchor, setAnchor] =
    useState<ComponentProps<typeof DropdownMenuContent>["anchor"]>()

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

  const apply = async (next: ReadonlyArray<string>) => {
    const exit = await updateTags({
      tags: next.map((name) => makeTagName(name))
    })
    if (Exit.isSuccess(exit)) setDeleteError(null)
  }

  const addTag = (name: string) => {
    if (displayedNames.includes(makeTagName(name))) return
    void apply([...displayedNames, name])
  }

  const removeFromTicket = (name: string) => {
    void apply(displayedNames.filter((tagName) => tagName !== name))
  }

  const createAndApply = async (name: TagName) => {
    const exit = await create({ name })
    if (Exit.isFailure(exit)) return
    setDraft("")
    addTag(name)
  }

  const ticketHasTag = (name: string) =>
    (displayedNames as ReadonlyArray<string>).includes(name)

  const usageCountFor = (currentName: TagName) =>
    Result.isSuccess(usageResult)
      ? (usageResult.value[currentName] ?? 0)
      : ticketHasTag(currentName)
        ? 1
        : 0

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-1",
        displayed.length > 0 && "ml-2.5"
      )}
    >
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
            onDeleteError={setDeleteError}
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
          onValueChange: (next) => setDraft(next.toLowerCase())
        }}
        onOpenChange={(open) => {
          const trigger = triggerRef.current
          if (!open || !trigger) return
          const bounds = trigger.getBoundingClientRect()
          setAnchor({
            getBoundingClientRect: () => bounds,
            contextElement: trigger
          })
        }}
        onOpenChangeComplete={(open) => {
          if (!open) setDraft("")
        }}
      >
        <DropdownMenuTrigger
          ref={triggerRef}
          render={
            <Button
              type="button"
              variant="chip"
              size={displayed.length === 0 ? undefined : "icon-sm"}
              className="motion-safe:transition-[background-color,color,scale]"
              aria-label={m.tags_add_button()}
            >
              <Plus className="size-3.5" strokeWidth={1.75} />
              {displayed.length === 0 ? m.tags_add_button() : null}
            </Button>
          }
        />
        <DropdownMenuContent
          anchor={anchor}
          align="start"
          sideOffset={6}
          className="w-56"
        >
          <TagMenuBody
            tags={registry}
            applied={displayedNames}
            draft={draft}
            canCreate={canManageTags}
            error={mutationErrorText(createState)}
            onToggle={(name) =>
              ticketHasTag(name) ? removeFromTicket(name) : addTag(name)
            }
            onCreate={(name) => void createAndApply(name)}
          />
        </DropdownMenuContent>
      </DropdownMenu>
      {deleteError && (
        <p role="alert" className="basis-full text-caption text-destructive">
          {deleteError}
        </p>
      )}
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
  onDeleteError,
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
  onDeleteError: (error: string | null) => void
  onManagementOpenChange: (open: boolean) => void
}) {
  const updateMutation = updateTagInEditor({ req, name: mutationName })
  const removeMutation = deleteTagInEditor({ req, name: mutationName })
  const update = useAtomSet(updateMutation, { mode: "promiseExit" })
  const updateState = useAtomValue(updateMutation)
  const remove = useAtomSet(removeMutation, { mode: "promiseExit" })
  const removeState = useAtomValue(removeMutation)
  const waiting = updateState.waiting || removeState.waiting
  const patch = async (next: { nextName?: TagName; color?: Tag["color"] }) => {
    const exit = await update({ name: next.nextName, color: next.color })
    if (Exit.isSuccess(exit)) onDeleteError(null)
  }
  const removeTag = async () => {
    onDeleteError(null)
    const exit = await remove()
    onDeleteError(mutationErrorText(Result.fromExit(exit)))
    if (Exit.isFailure(exit)) throw Cause.squash(exit.cause)
  }
  const hex = color ?? NEUTRAL
  const wrapperClass = cn(
    "inline-flex h-6 w-fit shrink-0 items-center gap-1.5 rounded-md px-2 text-caption whitespace-nowrap transition-colors",
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
      className="-mr-0.5 inline-grid size-4 place-items-center rounded-sm bg-transparent opacity-60 transition-[opacity,background-color] duration-100 hover:bg-black/15 hover:opacity-100 focus-visible:opacity-100 active:scale-[0.9] dark:hover:bg-white/20"
    >
      <X className="size-3" strokeWidth={2} />
    </button>
  )

  if (!canManage || !tag) {
    return (
      <span data-slot="tag-chip" className={wrapperClass} style={wrapperStyle}>
        {name}
        {removeButton}
      </span>
    )
  }

  return (
    <span data-slot="tag-chip" className={wrapperClass} style={wrapperStyle}>
      <TagAdminPopover
        tag={tag}
        usageCount={usageCount}
        updateError={mutationErrorText(updateState)}
        onPatch={(next) => void patch(next)}
        onDelete={removeTag}
        onOpenChange={onManagementOpenChange}
      >
        <button
          type="button"
          aria-label={m.tags_edit_aria_label({ name })}
          className="cursor-pointer rounded transition-transform duration-100 active:scale-[0.97]"
        >
          {name}
        </button>
      </TagAdminPopover>
      {removeButton}
    </span>
  )
}
