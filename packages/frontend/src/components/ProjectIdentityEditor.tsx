import { Result, useAtomSet, useAtomValue } from "@effect-atom/atom-react"
import * as Schema from "effect/Schema"
import { ProjectColor, ProjectIcon } from "@projectproject/shared"
import { projectKey, updateProjectAtom } from "@/atoms/projects"
import { ColorPicker } from "@/components/ColorPicker"
import {
  EmojiPicker,
  EmojiPickerContent,
  EmojiPickerSearch
} from "@/components/ui/emoji-picker"
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

const makeProjectIcon = Schema.decodeUnknownSync(ProjectIcon)
const makeProjectColor = Schema.decodeUnknownSync(ProjectColor)

type Props = {
  orgSlug: string
  slug: string
  icon: string
  color: string
  canEdit: boolean
  size?: "header" | "settings"
}

export function ProjectIdentityEditor({
  orgSlug,
  slug,
  icon,
  color,
  canEdit,
  size = "header"
}: Props) {
  const key = projectKey(orgSlug, slug)
  const update = useAtomSet(updateProjectAtom(key))
  const updateState = useAtomValue(updateProjectAtom(key))
  const waiting = updateState.waiting
  const error = Result.isFailure(updateState)
  const sizeClass = size === "header" ? "size-10 text-xl" : "size-12 text-2xl"

  const tile = (
    <span
      style={{ backgroundColor: color }}
      className={cn(
        "grid place-items-center rounded-lg leading-none shadow-sm",
        sizeClass,
        waiting && "animate-pulse"
      )}
    >
      <span aria-hidden>{icon}</span>
    </span>
  )

  if (!canEdit) {
    return (
      <div className={size === "header" ? "-mt-1 shrink-0" : "shrink-0"}>
        {tile}
      </div>
    )
  }

  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            type="button"
            aria-label={m.project_identity_aria_label()}
            className={cn(
              size === "header" ? "-mt-1 shrink-0" : "shrink-0",
              "rounded-lg outline-none transition-transform duration-100 hover:scale-[1.04] focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.97]"
            )}
          >
            {tile}
          </button>
        }
      />
      <PopoverContent align="start" sideOffset={8} className="flex gap-4 p-3">
        <div className="flex flex-col items-center justify-start pt-2">
          <ColorPicker
            value={color}
            onChange={(next) => update({ color: makeProjectColor(next) })}
            closeOnSelect={false}
            ariaLabel={m.color_picker_aria_label()}
          />
        </div>
        <div className="flex w-[320px] flex-col">
          <EmojiPicker
            className="h-[320px]"
            onEmojiSelect={({ emoji }) => update({ icon: makeProjectIcon(emoji) })}
          >
            <EmojiPickerSearch
              placeholder={m.project_identity_emoji_search_placeholder()}
              aria-label={m.project_identity_emoji_aria_label()}
            />
            <EmojiPickerContent />
          </EmojiPicker>
          {error ? (
            <div role="alert" className="mt-2 text-xs text-destructive">
              {m.project_identity_error()}
            </div>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  )
}
