import type { ProjectBanner, ProjectIconImage, ProjectTone } from "@pp/shared"
import { cn } from "@pp/ui/lib/utils"

import {
  LiveIconImage,
  LiveIcon
} from "@/features/projects/components/appearance/IconPreviewTile"
import { ProjectBanner as ProjectBannerSurface } from "@/features/projects/components/ProjectBanner"
import { ProjectIconTile } from "@/features/projects/components/ProjectIconTile"
import { useProjectRoute } from "@/features/projects/hooks/useProject"
import { m } from "@/paraglide/messages"

export function RenderPreviews({
  name,
  projectKey,
  icon,
  iconImage,
  color,
  tone,
  colors,
  banner,
  live,
  waiting = false
}: {
  name: string
  projectKey: string
  icon: string
  iconImage: ProjectIconImage | null
  color: string
  tone: ProjectTone
  colors: ReadonlyArray<string>
  banner: ProjectBanner | null
  live?: LiveIcon | null
  waiting?: boolean
}) {
  const { orgSlug, slug } = useProjectRoute()
  const header = (
    <ProjectIconTile
      orgSlug={orgSlug}
      icon={live && LiveIcon.$is("emoji")(live) ? live.emoji : icon}
      iconImage={live ? null : iconImage}
      color={color}
      tone={tone}
      colors={colors}
      size="md"
      seed={slug}
      iconNode={
        live && LiveIcon.$is("image")(live) ? (
          <LiveIconImage live={live} />
        ) : undefined
      }
    />
  )

  const sidebar = (
    <ProjectIconTile
      orgSlug={orgSlug}
      icon={live && LiveIcon.$is("emoji")(live) ? live.emoji : icon}
      iconImage={live ? null : iconImage}
      color={color}
      tone={tone}
      colors={colors}
      size="xs"
      seed={slug}
      iconNode={
        live && LiveIcon.$is("image")(live) ? (
          <LiveIconImage live={live} />
        ) : undefined
      }
    />
  )

  return (
    <div
      className={cn(
        "flex flex-col gap-2.5",
        waiting && "animate-pulse motion-reduce:animate-none"
      )}
    >
      <div className="relative isolate min-h-33 overflow-hidden rounded-lg border border-border bg-card">
        <ProjectBannerSurface
          orgSlug={orgSlug}
          slug={slug}
          banner={banner}
          variant="header"
        />
        <div className="relative flex items-center gap-3 p-4 pt-10">
          {header}
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-title font-semibold">{name}</span>
            <span className="truncate text-body text-muted-foreground tabular-nums">
              {projectKey}
            </span>
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2.5 rounded-lg border border-border bg-card p-3">
        {sidebar}
        <span className="min-w-0 flex-1 truncate text-body font-semibold">
          {name}
        </span>
        <span className="text-caption text-muted-foreground">
          {m.project_appearance_renders_sidebar()}
        </span>
      </div>
    </div>
  )
}
