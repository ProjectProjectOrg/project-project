import type { Project } from "@pp/shared"

import { ProjectBanner } from "@/features/projects/components/ProjectBanner"

export function ProjectBannerWarmup({
  orgSlug,
  project
}: Readonly<{ orgSlug: string; project: Project }>) {
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
