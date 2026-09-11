import type { ProjectIconImage } from "@projectproject/shared"
import { ProjectIconDisplay } from "@/components/ProjectIconDisplay"
import { ProjectTile } from "@/components/ProjectTile"
import { m } from "@/paraglide/messages"

export function RenderPreviews({
  orgSlug,
  slug,
  name,
  icon,
  iconImage,
  color,
  waiting = false
}: {
  orgSlug: string
  slug: string
  name: string
  icon: string
  iconImage: ProjectIconImage | null
  color: string
  waiting?: boolean
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <ProjectTile
          orgSlug={orgSlug}
          icon={icon}
          iconImage={iconImage}
          color={color}
          size="md"
          seed={slug}
          waiting={waiting}
        />
        <span className="text-xs text-muted-foreground">
          {m.project_appearance_renders_header()}
        </span>
      </div>

      <div className="flex items-center gap-2.5 rounded-lg bg-accent/60 px-3 py-2">
        <span
          aria-hidden
          className="inline-flex size-4 shrink-0 items-center justify-center overflow-hidden rounded-[4px] corner-squircle text-[13px] leading-none"
        >
          <ProjectIconDisplay
            orgSlug={orgSlug}
            icon={icon}
            iconImage={iconImage}
            size={16}
          />
        </span>
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium">
          {name}
        </span>
      </div>
      <span className="text-xs text-muted-foreground">
        {m.project_appearance_renders_sidebar()}
      </span>
    </div>
  )
}
