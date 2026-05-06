import { Result, useAtomSet, useAtomValue } from "@effect-atom/atom-react"
import { useMemo, useState } from "react"
import { TagChip } from "@/components/TagChip"
import { createTagAtom, tagsAtom, tagsKey } from "@/atoms/tags"
import { updateTicketAtom } from "@/atoms/tickets"
import type { TagName, TicketDetail } from "@projectproject/shared"

type Props = {
  orgSlug: string
  slug: string
  ticket: TicketDetail
  canManageTags: boolean
}

export function TagEditor({ orgSlug, slug, ticket, canManageTags }: Props) {
  const key = tagsKey(orgSlug, slug)
  const tagsResult = useAtomValue(tagsAtom(key))
  const updateTicket = useAtomSet(updateTicketAtom)
  const createTag = useAtomSet(createTagAtom(key))
  const [draft, setDraft] = useState("")

  const registry = Result.isSuccess(tagsResult) ? tagsResult.value : []
  const colorByName = useMemo(() => {
    const map = new Map<string, string>()
    for (const t of registry) map.set(t.name, t.color)
    return map
  }, [registry])

  const applied = ticket.tags
  const lowered = draft.trim().toLowerCase()
  const suggestions = lowered
    ? registry
        .filter((t) => t.name.includes(lowered) && !applied.includes(t.name))
        .slice(0, 5)
    : []
  const exactRegistered = registry.find((t) => t.name === lowered)
  const isValidNewName = /^[a-z0-9][a-z0-9-]{0,30}$/.test(lowered)

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
  }

  const removeTag = (name: string) => {
    apply(applied.filter((t) => t !== name))
  }

  const createAndApply = () => {
    if (!isValidNewName) return
    Promise.resolve(createTag({ name: lowered as TagName })).then(() =>
      addTag(lowered)
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-1">
      {applied.map((name) => (
        <TagChip
          key={name}
          name={name}
          color={colorByName.get(name) ?? null}
          onRemove={() => removeTag(name)}
        />
      ))}
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value.toLowerCase())}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault()
            if (exactRegistered) addTag(exactRegistered.name)
            else if (canManageTags) createAndApply()
          }
          if (e.key === "Backspace" && draft === "" && applied.length) {
            apply(applied.slice(0, -1))
          }
        }}
        placeholder={applied.length ? "" : "Add tag..."}
        className="h-6 min-w-[8ch] flex-1 bg-transparent text-xs outline-none"
      />
      {draft && suggestions.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {suggestions.map((t) => (
            <button
              key={t.name}
              type="button"
              onClick={() => addTag(t.name)}
              className="text-[11px] underline-offset-2 transition-colors duration-100 hover:underline active:scale-[0.97]"
            >
              + {t.name}
            </button>
          ))}
        </div>
      ) : null}
      {draft && !exactRegistered && isValidNewName && canManageTags ? (
        <button
          type="button"
          onClick={createAndApply}
          className="text-[11px] text-muted-foreground transition-colors duration-100 hover:text-foreground active:scale-[0.97]"
        >
          + Create tag '{lowered}'
        </button>
      ) : null}
    </div>
  )
}
