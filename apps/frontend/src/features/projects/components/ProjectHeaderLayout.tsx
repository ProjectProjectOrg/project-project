import { getRouteApi, Outlet } from "@tanstack/react-router"

import { PageContainer } from "@/components/shell/Page"
import { ProjectHeader } from "@/features/projects/components/ProjectHeader"
import { TabsNav } from "@/features/projects/components/ProjectTabsNav"
import { useProject } from "@/features/projects/hooks/useProject"

const routeApi = getRouteApi(
  "/_authed/orgs/$orgSlug/projects/$slug/_projectHeader"
)

export function ProjectHeaderLayout() {
  const { orgSlug, slug } = routeApi.useParams()
  const project = useProject()

  return (
    <>
      <PageContainer className="gap-3">
        <ProjectHeader
          orgSlug={orgSlug}
          slug={project.slug}
          name={project.name}
          project={project}
        />
        <TabsNav orgSlug={orgSlug} slug={slug} project={project} />
      </PageContainer>
      <Outlet />
    </>
  )
}
