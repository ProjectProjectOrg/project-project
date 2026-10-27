import type { ProjectBanner, ProjectIconImage } from "@pp/shared"

import {
  LiveIconImage,
  type LiveIcon
} from "@/features/projects/components/appearance/IconPreviewTile"
import { ProjectBanner as ProjectBannerSurface } from "@/features/projects/components/ProjectBanner"
import { ProjectIconDisplay } from "@/features/projects/components/ProjectIconDisplay"
import { ProjectIconTile } from "@/features/projects/components/ProjectIconTile"
import { useProjectRoute } from "@/features/projects/hooks/useProject"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

export function RenderPreviews({
  name,
  projectKey,
  icon,
  iconImage,
  color,
  banner,
  live,
  waiting = false
}: {
  name: string
  projectKey: string
  icon: string
  iconImage: ProjectIconImage | null
  color: string
  banner: ProjectBanner | null
  live?: LiveIcon | null
  waiting?: boolean
}) {
  const { orgSlug, slug } = useProjectRoute()
  const header = (
    <ProjectIconTile
      orgSlug={orgSlug}
      icon={live?.kind === "emoji" ? live.emoji : icon}
      iconImage={live ? null : iconImage}
      color={color}
      size="md"
      seed={slug}
      iconNode={
        live?.kind === "image" ? <LiveIconImage live={live} /> : undefined
      }
    />
  )

  const sidebar = (
    <span
      aria-hidden
      className="relative inline-flex size-4 shrink-0 items-center justify-center overflow-hidden rounded-[4px] text-[13px] leading-none corner-squircle"
    >
      {live?.kind === "image" ? (
        <LiveIconImage live={live} />
      ) : (
        <ProjectIconDisplay
          orgSlug={orgSlug}
          icon={live?.kind === "emoji" ? live.emoji : icon}
          iconImage={live ? null : iconImage}
          size={16}
        />
      )}
    </span>
  )

  return (
    <div
      className={cn(
        "flex flex-col gap-2.5",
        waiting && "animate-pulse motion-reduce:animate-none"
      )}
    >
      <div className="relative isolate min-h-[132px] overflow-hidden rounded-lg border border-border bg-card">
        <ProjectBannerSurface
          orgSlug={orgSlug}
          slug={slug}
          banner={banner}
          variant="header"
        />
        <div className="relative flex items-center gap-3 p-4 pt-10">
          {header}
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
        {sidebar}
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
