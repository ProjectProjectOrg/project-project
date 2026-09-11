import { useAtomSet, useAtomValue } from "@effect/atom-react"
import * as Exit from "effect/Exit"
import * as Schema from "effect/Schema"
import { useState, type ReactNode } from "react"
import {
  ProjectColor,
  ProjectIcon,
  type ProjectIconImage
} from "@projectproject/shared"
import { projectKey, updateProjectAtom } from "@/atoms/projects"
import { ColorPicker } from "@/components/ColorPicker"
import { ProjectIconUpload } from "@/components/ProjectIconUpload"
import { ProjectTile } from "@/components/ProjectTile"
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

type SharedProps = {
  orgSlug: string
  slug: string
  canEdit: boolean
}

type TriggerShape = "squircle" | "square" | "circle"

const TRIGGER_SHAPE: Record<TriggerShape, string> = {
  squircle: "rounded-2xl corner-squircle",
  square: "rounded-md",
  circle: "rounded-full"
}

function useAppearanceMutation(orgSlug: string, slug: string) {
  const update = useAtomSet(updateProjectAtom(projectKey(orgSlug, slug)), {
    mode: "promiseExit"
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)

  const submit = async (input: Parameters<typeof update>[0]) => {
    setBusy(true)
    setError(false)
    const result = await update(input)
    setBusy(false)
    setError(Exit.isFailure(result))
  }

  return { submit, busy, error }
}

function AppearanceControl({
  label,
  ariaLabel,
  shape,
  trigger,
  canEdit,
  error,
  children
}: {
  label: string
  ariaLabel: string
  shape: TriggerShape
  trigger: ReactNode
  canEdit: boolean
  error: boolean
  children: ReactNode
}) {
  return (
    <div className="flex flex-col items-start gap-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      {canEdit ? (
        <Popover>
          <PopoverTrigger
            render={
              <button
                type="button"
                aria-label={ariaLabel}
                className={cn(
                  "w-fit shrink-0 outline-none transition-transform duration-100 active:scale-[0.97]",
                  TRIGGER_SHAPE[shape]
                )}
              >
                {trigger}
              </button>
            }
          />
          <PopoverContent
            align="start"
            sideOffset={8}
            keepMounted
            className="w-fit p-0"
          >
            {children}
            {error && (
              <div role="alert" className="p-3 pt-0 text-xs text-destructive">
                {m.project_identity_error()}
              </div>
            )}
          </PopoverContent>
        </Popover>
      ) : (
        trigger
      )}
    </div>
  )
}

export function ProjectIconControl({
  orgSlug,
  slug,
  icon,
  iconImage,
  color,
  canEdit
}: SharedProps & {
  icon: string
  iconImage: ProjectIconImage | null
  color: string
}) {
  const updateState = useAtomValue(updateProjectAtom(projectKey(orgSlug, slug)))
  return (
    <AppearanceControl
      label={m.project_identity_icon_label()}
      ariaLabel={m.project_identity_icon_aria_label()}
      shape="squircle"
      canEdit={canEdit}
      error={false}
      trigger={
        <ProjectTile
          orgSlug={orgSlug}
          icon={icon}
          iconImage={iconImage}
          color={color}
          size="lg"
          seed={slug}
          waiting={updateState.waiting}
        />
      }
    >
      <div className="p-3">
        <ProjectIconUpload
          orgSlug={orgSlug}
          slug={slug}
          iconImage={iconImage}
        />
      </div>
    </AppearanceControl>
  )
}

export function ProjectEmojiControl({
  orgSlug,
  slug,
  icon,
  canEdit
}: SharedProps & { icon: string }) {
  const { submit, busy, error } = useAppearanceMutation(orgSlug, slug)

  return (
    <AppearanceControl
      label={m.project_identity_emoji_label()}
      ariaLabel={m.project_identity_emoji_aria_label()}
      shape="square"
      canEdit={canEdit}
      error={error}
      trigger={
        <span
          className={cn(
            "grid size-8 place-items-center rounded-md border border-border bg-muted text-base leading-none",
            busy && "animate-pulse"
          )}
        >
          {icon}
        </span>
      }
    >
      <EmojiPicker
        className="h-[320px]"
        onEmojiSelect={({ emoji }) =>
          void submit({ icon: makeProjectIcon(emoji) })
        }
      >
        <EmojiPickerSearch
          placeholder={m.project_identity_emoji_search_placeholder()}
          aria-label={m.project_identity_emoji_aria_label()}
        />
        <EmojiPickerContent />
      </EmojiPicker>
    </AppearanceControl>
  )
}

export function ProjectAccentColorControl({
  orgSlug,
  slug,
  color,
  canEdit
}: SharedProps & { color: string }) {
  const { submit, busy, error } = useAppearanceMutation(orgSlug, slug)

  return (
    <AppearanceControl
      label={m.project_identity_accent_color_label()}
      ariaLabel={m.project_identity_accent_color_aria_label()}
      shape="circle"
      canEdit={canEdit}
      error={error}
      trigger={
        <span
          aria-hidden
          className={cn(
            "block size-8 rounded-full border border-border/60 shadow-sm",
            busy && "animate-pulse"
          )}
          style={{ backgroundColor: color }}
        />
      }
    >
      <div className="p-3">
        <ColorPicker
          value={color}
          onChange={(next) => void submit({ color: makeProjectColor(next) })}
          ariaLabel={m.color_picker_aria_label()}
        />
      </div>
    </AppearanceControl>
  )
}

export function ProjectAppearanceGroup({
  orgSlug,
  slug,
  icon,
  iconImage,
  color,
  canEdit
}: SharedProps & {
  icon: string
  iconImage: ProjectIconImage | null
  color: string
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs text-muted-foreground">
        {m.project_settings_identity_label()}
      </span>
      <div className="flex items-start gap-5">
        <ProjectIconControl
          orgSlug={orgSlug}
          slug={slug}
          icon={icon}
          iconImage={iconImage}
          color={color}
          canEdit={canEdit}
        />
        <ProjectEmojiControl
          orgSlug={orgSlug}
          slug={slug}
          icon={icon}
          canEdit={canEdit}
        />
        <ProjectAccentColorControl
          orgSlug={orgSlug}
          slug={slug}
          color={color}
          canEdit={canEdit}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        {m.project_identity_emoji_hint()}
      </p>
    </div>
  )
}
