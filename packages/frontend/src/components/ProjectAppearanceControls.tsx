import * as Result from "effect/unstable/reactivity/AsyncResult"
import { useAtomSet, useAtomValue } from "@effect/atom-react"
import * as Schema from "effect/Schema"
import type { ReactNode } from "react"
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
import { m } from "@/paraglide/messages"

const makeProjectIcon = Schema.decodeUnknownSync(ProjectIcon)
const makeProjectColor = Schema.decodeUnknownSync(ProjectColor)

type SharedProps = {
  orgSlug: string
  slug: string
  canEdit: boolean
}

function useProjectUpdate(orgSlug: string, slug: string) {
  const key = projectKey(orgSlug, slug)
  const update = useAtomSet(updateProjectAtom(key))
  const updateState = useAtomValue(updateProjectAtom(key))
  return {
    update,
    waiting: updateState.waiting,
    error: Result.isFailure(updateState)
  }
}

function MutationError({ show }: { show: boolean }) {
  if (!show) return null
  return (
    <div role="alert" className="mt-1 text-xs text-destructive">
      {m.project_identity_error()}
    </div>
  )
}

function ControlLabel({ children }: { children: ReactNode }) {
  return <span className="text-xs text-muted-foreground">{children}</span>
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
  const { waiting, error } = useProjectUpdate(orgSlug, slug)
  const tile = (
    <ProjectTile
      orgSlug={orgSlug}
      icon={icon}
      iconImage={iconImage}
      color={color}
      size="lg"
      seed={slug}
      waiting={waiting}
    />
  )

  if (!canEdit) {
    return (
      <div className="flex flex-col items-start gap-1.5">
        <ControlLabel>{m.project_identity_icon_label()}</ControlLabel>
        {tile}
      </div>
    )
  }

  return (
    <div className="flex flex-col items-start gap-1.5">
      <ControlLabel>{m.project_identity_icon_label()}</ControlLabel>
      <Popover>
        <PopoverTrigger
          render={
            <button
              type="button"
              aria-label={m.project_identity_icon_aria_label()}
              className="w-fit shrink-0 rounded-2xl corner-squircle outline-none transition-transform duration-100 active:scale-[0.97]"
            >
              {tile}
            </button>
          }
        />
        <PopoverContent
          align="start"
          sideOffset={8}
          keepMounted
          className="w-fit p-3"
        >
          <ProjectIconUpload
            orgSlug={orgSlug}
            slug={slug}
            iconImage={iconImage}
          />
          <MutationError show={error} />
        </PopoverContent>
      </Popover>
    </div>
  )
}

export function ProjectEmojiControl({
  orgSlug,
  slug,
  icon,
  canEdit
}: SharedProps & { icon: string }) {
  const { update, error } = useProjectUpdate(orgSlug, slug)

  const chip = (
    <span className="grid size-8 place-items-center rounded-md border border-border bg-muted text-base leading-none">
      {icon}
    </span>
  )

  if (!canEdit) {
    return (
      <div className="flex flex-col items-start gap-1.5">
        <ControlLabel>{m.project_identity_emoji_label()}</ControlLabel>
        {chip}
      </div>
    )
  }

  return (
    <div className="flex flex-col items-start gap-1.5">
      <ControlLabel>{m.project_identity_emoji_label()}</ControlLabel>
      <Popover>
        <PopoverTrigger
          render={
            <button
              type="button"
              aria-label={m.project_identity_emoji_aria_label()}
              className="w-fit shrink-0 rounded-md outline-none transition-transform duration-100 active:scale-[0.97]"
            >
              {chip}
            </button>
          }
        />
        <PopoverContent
          align="start"
          sideOffset={8}
          keepMounted
          className="w-fit p-0"
        >
          <EmojiPicker
            className="h-[320px]"
            onEmojiSelect={({ emoji }) =>
              update({ icon: makeProjectIcon(emoji) })
            }
          >
            <EmojiPickerSearch
              placeholder={m.project_identity_emoji_search_placeholder()}
              aria-label={m.project_identity_emoji_aria_label()}
            />
            <EmojiPickerContent />
          </EmojiPicker>
          <MutationError show={error} />
        </PopoverContent>
      </Popover>
    </div>
  )
}

export function ProjectAccentColorControl({
  orgSlug,
  slug,
  color,
  canEdit
}: SharedProps & { color: string }) {
  const { update, error } = useProjectUpdate(orgSlug, slug)

  const swatch = (
    <span
      aria-hidden
      className="block size-8 rounded-full border border-border/60 shadow-sm"
      style={{ backgroundColor: color }}
    />
  )

  if (!canEdit) {
    return (
      <div className="flex flex-col items-start gap-1.5">
        <ControlLabel>{m.project_identity_accent_color_label()}</ControlLabel>
        {swatch}
      </div>
    )
  }

  return (
    <div className="flex flex-col items-start gap-1.5">
      <ControlLabel>{m.project_identity_accent_color_label()}</ControlLabel>
      <Popover>
        <PopoverTrigger
          render={
            <button
              type="button"
              aria-label={m.project_identity_accent_color_aria_label()}
              className="w-fit shrink-0 rounded-full outline-none transition-transform duration-100 active:scale-[0.97]"
            >
              {swatch}
            </button>
          }
        />
        <PopoverContent
          align="start"
          sideOffset={8}
          keepMounted
          className="w-fit p-3"
        >
          <ColorPicker
            value={color}
            onChange={(next) => update({ color: makeProjectColor(next) })}
            ariaLabel={m.color_picker_aria_label()}
          />
          <MutationError show={error} />
        </PopoverContent>
      </Popover>
    </div>
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
