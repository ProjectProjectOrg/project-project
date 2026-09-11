import type { ProjectBanner, ProjectIconImage } from "@projectproject/shared"
import { ProjectBanner as ProjectBannerSurface } from "@/components/ProjectBanner"
import { ProjectIconDisplay } from "@/components/ProjectIconDisplay"
import { ProjectTile } from "@/components/ProjectTile"
import {
  LiveIconImage,
  type LiveIcon
} from "@/components/appearance/IconPreviewTile"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

export function RenderPreviews({
  orgSlug,
  slug,
  name,
  projectKey,
  icon,
  iconImage,
  color,
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
  color: string
  banner: ProjectBanner | null
  live?: LiveIcon | null
  waiting?: boolean
}) {
  const header = (
    <ProjectTile
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
      className="relative inline-flex size-4 shrink-0 items-center justify-center overflow-hidden rounded-[4px] corner-squircle text-[13px] leading-none"
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
    <div className={cn("flex flex-col gap-2.5", waiting && "animate-pulse")}>
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
