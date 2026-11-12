import { Outlet, useMatches } from "@tanstack/react-router"

import { PageContainer } from "@/components/shell/Page"
import { ProjectHeader } from "@/features/projects/components/ProjectHeader"
import { TabsNav } from "@/features/projects/components/ProjectTabsNav"
import { ProjectToolbarSlot } from "@/features/projects/components/ProjectToolbarSlot"
import { useProject } from "@/features/projects/hooks/useProject"

const TICKET_ROUTES: ReadonlySet<string> = new Set([
  "/_authed/orgs/$orgSlug/projects/$slug/_projectHeader/",
  "/_authed/orgs/$orgSlug/projects/$slug/_projectHeader/sprints/$groupId"
])

export function ProjectHeaderLayout() {
  const project = useProject()
  const onTickets = useMatches({
    select: (matches) =>
      matches.some((match) => TICKET_ROUTES.has(match.routeId))
  })

  return (
    <>
      <PageContainer className="gap-3">
        <ProjectHeader name={project.name} project={project} />
        <div className="flex flex-wrap items-center gap-2">
          <TabsNav project={project} />
          {onTickets && (
            <ProjectToolbarSlot className="min-w-0 flex-1 basis-[480px]" />
          )}
        </div>
      </PageContainer>
      <Outlet />
    </>
  )
}
