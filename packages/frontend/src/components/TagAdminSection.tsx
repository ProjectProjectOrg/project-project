import { Result, useAtomSet, useAtomValue } from "@effect-atom/atom-react"
import { useState } from "react"
import { TagChip } from "@/components/TagChip"
import {
  tagsAtom,
  tagsKey,
  createTagAtom,
  renameTagAtom,
  deleteTagAtom
} from "@/atoms/tags"
import { ticketsListAtom, ticketsListKey } from "@/atoms/tickets"
import type { Tag, TagName } from "@projectproject/shared"

type Props = { orgSlug: string; slug: string }

export function TagAdminSection({ orgSlug, slug }: Props) {
  const key = tagsKey(orgSlug, slug)
  const tags = useAtomValue(tagsAtom(key))
  const tickets = useAtomValue(ticketsListAtom(ticketsListKey(orgSlug, slug)))
  const create = useAtomSet(createTagAtom(key))
  const rename = useAtomSet(renameTagAtom(key))
  const remove = useAtomSet(deleteTagAtom(key))

  const [draft, setDraft] = useState("")
  const [pendingDelete, setPendingDelete] = useState<{
    name: string
    usages: { ticketId: string; title: string }[]
  } | null>(null)

  const list = Result.isSuccess(tags) ? tags.value : []
  const ticketList = Result.isSuccess(tickets) ? tickets.value : []
  const usageCount = (name: string) =>
    ticketList.reduce((n, t) => n + (t.tags.includes(name as TagName) ? 1 : 0), 0)

  const handleCreate = () => {
    const lowered = draft.trim().toLowerCase()
    if (!/^[a-z0-9][a-z0-9-]{0,30}$/.test(lowered)) return
    Promise.resolve(create({ name: lowered as TagName })).then(() => setDraft(""))
  }

  const handleDelete = async (name: string) => {
    try {
      await remove({ name: name as TagName, force: false })
      setPendingDelete(null)
    } catch (e: any) {
      if (e?._tag === "TagInUse") {
        setPendingDelete({ name, usages: e.usages })
      } else {
        throw e
      }
    }
  }

  const handleForceDelete = async () => {
    if (!pendingDelete) return
    await remove({ name: pendingDelete.name as TagName, force: true })
    setPendingDelete(null)
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value.toLowerCase())}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              handleCreate()
            }
          }}
          placeholder="new-tag-name"
          className="h-7 rounded-md border bg-transparent px-2 text-xs"
        />
        <button
          type="button"
          onClick={handleCreate}
          className="h-7 rounded-md border px-2 text-xs transition-transform duration-100 active:scale-[0.97]"
        >
          Create
        </button>
      </div>
      <div className="flex flex-col gap-2">
        {list.map((tag) => (
          <TagRow
            key={tag.name}
            tag={tag}
            usageCount={usageCount(tag.name)}
            onRename={(next) => rename({ oldName: tag.name, nextName: next })}
            onRecolor={(color) => rename({ oldName: tag.name, color })}
            onDelete={() => handleDelete(tag.name)}
          />
        ))}
      </div>
      {pendingDelete ? (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-xs">
          <p>
            <strong>{pendingDelete.name}</strong> is applied to{" "}
            {pendingDelete.usages.length} ticket
            {pendingDelete.usages.length === 1 ? "" : "s"}:{" "}
            {pendingDelete.usages
              .map((u) => `${u.ticketId} ${u.title}`)
              .join(", ")}
            . Delete anyway?
          </p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={handleForceDelete}
              className="h-7 rounded-md border border-red-500 px-2 text-red-600 transition-transform duration-100 active:scale-[0.97]"
            >
              Delete and strip
            </button>
            <button
              type="button"
              onClick={() => setPendingDelete(null)}
              className="h-7 rounded-md border px-2 transition-transform duration-100 active:scale-[0.97]"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function TagRow({
  tag,
  usageCount,
  onRename,
  onRecolor,
  onDelete
}: {
  tag: Tag
  usageCount: number
  onRename: (next: TagName) => void
  onRecolor: (color: Tag["color"]) => void
  onDelete: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<string>(tag.name as string)

  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        value={tag.color}
        onChange={(e) => onRecolor(e.target.value as Tag["color"])}
        className="size-6 cursor-pointer rounded border bg-transparent p-0"
        aria-label={`Color for ${tag.name}`}
      />
      {editing ? (
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value.toLowerCase())}
          onBlur={() => {
            const trimmed = draft.trim()
            if (
              trimmed !== tag.name &&
              /^[a-z0-9][a-z0-9-]{0,30}$/.test(trimmed)
            ) {
              onRename(trimmed as TagName)
            }
            setEditing(false)
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur()
            if (e.key === "Escape") {
              setDraft(tag.name as string)
              setEditing(false)
            }
          }}
          autoFocus
          className="h-6 rounded border bg-transparent px-1 text-xs"
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="text-left transition-transform duration-100 active:scale-[0.97]"
        >
          <TagChip name={tag.name as string} color={tag.color} />
        </button>
      )}
      <span className="text-xs text-muted-foreground">
        {usageCount} ticket{usageCount === 1 ? "" : "s"}
      </span>
      <button
        type="button"
        onClick={onDelete}
        className="ml-auto text-xs text-red-600 transition-transform duration-100 active:scale-[0.97]"
      >
        Delete
      </button>
    </div>
  )
}
