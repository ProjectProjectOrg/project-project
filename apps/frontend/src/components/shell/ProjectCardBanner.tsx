import type { Project } from "@pp/shared"
import { DitherBackdrop } from "@pp/ui/button-dither"

import { ProjectBanner } from "@/features/projects/components/ProjectBanner"

export function ProjectCardBanner({
  orgSlug,
  project
}: {
  orgSlug: string
  project: Project
}) {
  return (
    <span className="relative isolate block h-8 overflow-hidden">
      {project.banner ? (
        <ProjectBanner
          orgSlug={orgSlug}
          slug={project.slug}
          banner={project.banner}
          variant="row"
        />
      ) : (
        <DefaultBanner color={project.color} />
      )}
    </span>
  )
}

export function ProjectBannerWarmup({
  orgSlug,
  project
}: {
  orgSlug: string
  project: Project
}) {
  if (!project.banner) return null
  return (
    <span
      aria-hidden
      className="pointer-events-none fixed top-0 left-0 isolate -z-50 block h-8 w-50 overflow-hidden opacity-0"
    >
      <ProjectBanner
        orgSlug={orgSlug}
        slug={project.slug}
        banner={project.banner}
        variant="row"
      />
    </span>
  )
}

function DefaultBanner({ color }: { color: string }) {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute inset-0 -z-10 opacity-40"
    >
      <DitherBackdrop
        from={color}
        to="var(--card)"
        direction="b"
        stops={[0, 1]}
        matrix="4x4"
        pixelSize={2}
      />
    </span>
  )
}
