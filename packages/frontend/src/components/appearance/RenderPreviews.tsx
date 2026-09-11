import type { ProjectBanner, ProjectIconImage } from "@projectproject/shared"
import { ProjectBanner as ProjectBannerSurface } from "@/components/ProjectBanner"
import { ProjectIconDisplay } from "@/components/ProjectIconDisplay"
import {
  IconPreviewTile,
  type LiveIcon
} from "@/components/appearance/IconPreviewTile"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

function PreviewIcon({
  orgSlug,
  icon,
  iconImage,
  live,
  size,
  radius
}: {
  orgSlug: string
  icon: string
  iconImage: ProjectIconImage | null
  live: LiveIcon | null | undefined
  size: number
  radius: number
}) {
  if (live) return <IconPreviewTile live={live} size={size} radius={radius} />
  return (
    <span
      aria-hidden
      className="inline-flex shrink-0 items-center justify-center overflow-hidden corner-squircle"
      style={{ width: size, height: size, borderRadius: radius }}
    >
      <ProjectIconDisplay
        orgSlug={orgSlug}
        icon={icon}
        iconImage={iconImage}
        size={size}
      />
    </span>
  )
}

export function RenderPreviews({
  orgSlug,
  slug,
  name,
  projectKey,
  icon,
  iconImage,
  banner,
  live,
  waiting = false
}: {
  orgSlug: string
  slug: string
  name: string
  projectKey: string
  icon: string
  iconImage: ProjectIconImage | null
  banner: ProjectBanner | null
  live?: LiveIcon | null
  waiting?: boolean
}) {
  const shared = { orgSlug, icon, iconImage, live }

  return (
    <div className={cn("flex flex-col gap-2.5", waiting && "animate-pulse")}>
      <div className="relative isolate min-h-[132px] overflow-hidden rounded-lg border border-border bg-card">
        <ProjectBannerSurface
          orgSlug={orgSlug}
          slug={slug}
          banner={banner}
          variant="header"
        />
        <div className="relative mt-auto flex items-center gap-3 p-4 pt-10">
          <PreviewIcon {...shared} size={40} radius={14} />
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-lg font-semibold tracking-tight">
              {name}
            </span>
            <span className="truncate font-mono text-[13px] text-muted-foreground">
              {projectKey}
            </span>
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2.5 rounded-lg border border-border bg-card p-3">
        <span className="inline-flex size-4 shrink-0 items-center justify-center overflow-hidden rounded-[4px] corner-squircle">
          <PreviewIcon {...shared} size={16} radius={4} />
        </span>
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium">
          {name}
        </span>
        <span className="text-xs text-muted-foreground">
          {m.project_appearance_renders_sidebar()}
        </span>
      </div>
    </div>
  )
}
