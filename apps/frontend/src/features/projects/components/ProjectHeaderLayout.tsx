import { Outlet } from "@tanstack/react-router"

import { PageContainer } from "@/components/shell/Page"
import { ReferencesBanner } from "@/features/project-references/components/ReferencesBanner"
import { ProjectHeader } from "@/features/projects/components/ProjectHeader"
import { useProject } from "@/features/projects/hooks/useProject"

export function ProjectHeaderLayout() {
  const project = useProject()

  return (
    <>
      <PageContainer className="gap-3">
        <ProjectHeader name={project.name} project={project} />
        <ReferencesBanner />
      </PageContainer>
      <Outlet />
    </>
  )
}
