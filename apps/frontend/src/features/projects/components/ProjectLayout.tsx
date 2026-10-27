import { useAtomValue } from "@effect/atom-react"
import { getRouteApi, Outlet } from "@tanstack/react-router"
import * as Match from "effect/Match"
import * as Result from "effect/reactivity/AsyncResult"

import { ErrorPage } from "@/components/shell/ErrorPage"
import { NotFoundPage } from "@/components/shell/NotFoundPage"
import { PageContainer } from "@/components/shell/Page"
import { useProjectGitStatePolling } from "@/features/github/hooks/useProjectGitStatePolling"
import {
  project,
  projectRequest,
  updateProject
} from "@/features/projects/atoms/projects"
import { ProjectBanner } from "@/features/projects/components/ProjectBanner"
import { ProjectSetupSlot } from "@/features/projects/components/ProjectSetupRail"
import { RetainedProjectViews } from "@/features/projects/components/RetainedProjectViews"
import {
  ProjectContext,
  useProjectRoute
} from "@/features/projects/hooks/useProject"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

const routeApi = getRouteApi("/_authed/orgs/$orgSlug/projects/$slug")

export function ProjectLayout() {
  const { orgSlug, slug } = routeApi.useParams()
  const req = projectRequest(orgSlug, slug)
  const projectResult = useAtomValue(project(req))
  const projectUpdate = useAtomValue(updateProject(req))

  return Result.matchWithError(projectResult, {
    onInitial: () => (
      <PageContainer>
        <Skeleton />
      </PageContainer>
    ),
    onError: (error) =>
      Match.value(error).pipe(
        Match.tag("NotFound", () => (
          <NotFoundPage
            contained
            title={m.project_detail_not_found_title()}
            body={m.project_detail_not_found_body({ slug })}
          />
        )),
        Match.orElse((error) => (
          <ErrorPage
            contained
            error={error}
            title={m.project_detail_load_error_title()}
            body={m.project_detail_load_error_body()}
          />
        ))
      ),
    onDefect: (defect) => (
      <ErrorPage
        contained
        error={defect}
        title={m.project_detail_load_error_title()}
        body={m.project_detail_load_error_body()}
      />
    ),
    onSuccess: ({ value, waiting }) => (
      <ProjectContext.Provider value={req}>
        <ProjectGitStatePolling enabled={value.github !== null} />
        <ProjectSetupSlot project={value} />
        <div
          data-page-banner={value.banner ? "" : undefined}
          className={cn("relative isolate flex flex-1 flex-col gap-3")}
        >
          <ProjectBanner
            orgSlug={orgSlug}
            slug={slug}
            banner={value.banner}
            waiting={waiting && projectUpdate.waiting}
            pageBackdrop
          />
          <Outlet />
          <RetainedProjectViews key={`${orgSlug}/${slug}`} />
        </div>
      </ProjectContext.Provider>
    )
  })
}

function ProjectGitStatePolling({ enabled }: { enabled: boolean }) {
  const { orgSlug, slug } = useProjectRoute()
  useProjectGitStatePolling(orgSlug, slug, enabled)
  return null
}

function Skeleton() {
  return (
    <div className="flex flex-col gap-4">
      <div className="skeleton h-12 rounded-lg bg-muted/60" />
      <div className="skeleton h-9 rounded-lg bg-muted/60" />
      <div className="skeleton h-40 rounded-xl bg-muted/60" />
    </div>
  )
}
