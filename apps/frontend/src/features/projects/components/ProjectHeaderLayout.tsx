import { Outlet } from "@tanstack/react-router"

import { PageContainer } from "@/components/shell/Page"
import { ProjectHeader } from "@/features/projects/components/ProjectHeader"
import { TabsNav } from "@/features/projects/components/ProjectTabsNav"
import { useProject } from "@/features/projects/hooks/useProject"

export function ProjectHeaderLayout() {
  const project = useProject()

  return (
    <>
      <PageContainer className="gap-3">
        <ProjectHeader name={project.name} project={project} />
        <TabsNav project={project} />
      </PageContainer>
      <Outlet />
    </>
  )
}
