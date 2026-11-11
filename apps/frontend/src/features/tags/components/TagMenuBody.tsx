import { TagName, type Tag } from "@pp/shared"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import { Plus } from "lucide-react"

import {
  DropdownMenuEmpty,
  DropdownMenuInput,
  DropdownMenuItem,
  DropdownMenuList
} from "@/components/ui/dropdown-menu"
import { TagMenuItem } from "@/features/tags/components/TagMenuItem"
import { m } from "@/paraglide/messages"

const decodeTagName = Schema.decodeUnknownOption(TagName)

export function TagMenuBody({
  tags,
  applied,
  draft,
  canCreate,
  onToggle,
  onCreate
}: Readonly<{
  tags: ReadonlyArray<Tag>
  applied: ReadonlyArray<string>
  draft: string
  canCreate: boolean
  onToggle: (name: TagName) => void
  onCreate: (name: TagName) => void
}>) {
  const newName = Option.filter(
    decodeTagName(draft.trim()),
    (name) => canCreate && !tags.some((tag) => tag.name === name)
  )
  return (
    <>
      <DropdownMenuInput
        placeholder={
          canCreate
            ? m.tags_search_or_create_placeholder()
            : m.tickets_command_tags_placeholder()
        }
        aria-label={m.tickets_command_tags_placeholder()}
      />
      <DropdownMenuList className="max-h-72 overflow-y-auto">
        {tags.map((tag) => (
          <TagMenuItem
            key={tag.name}
            tag={tag}
            checked={applied.includes(tag.name)}
            onToggle={() => onToggle(tag.name)}
          />
        ))}
        {Option.isSome(newName) && (
          <DropdownMenuItem
            label={newName.value}
            closeOnClick={false}
            onClick={() => onCreate(newName.value)}
            className="cursor-pointer"
          >
            <Plus className="size-4" strokeWidth={1.75} />
            {m.tags_create_button({ name: newName.value })}
          </DropdownMenuItem>
        )}
      </DropdownMenuList>
      <DropdownMenuEmpty>{m.tickets_command_tags_empty()}</DropdownMenuEmpty>
    </>
  )
}
