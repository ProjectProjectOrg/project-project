import { useAtomValue } from "@effect/atom-react"
import { getRouteApi, Outlet, useMatch } from "@tanstack/react-router"
import * as Match from "effect/Match"
import * as Result from "effect/reactivity/AsyncResult"

import { ErrorPage } from "@/components/shell/ErrorPage"
import { LoaderOverlay } from "@/components/shell/LoaderOverlay"
import { NotFoundPage } from "@/components/shell/NotFoundPage"
import { useProjectGitStatePolling } from "@/features/github/hooks/useProjectGitStatePolling"
import { LocalCopyGate } from "@/features/local/components/LocalCopyGate"
import { LocalProjectCopy } from "@/features/local/components/LocalProjectCopy"
import {
  project,
  projectRequest,
  updateProject
} from "@/features/projects/atoms/projects"
import { ProjectBanner } from "@/features/projects/components/ProjectBanner"
import { RetainedProjectViews } from "@/features/projects/components/RetainedProjectViews"
import {
  ProjectContext,
  useProjectRoute
} from "@/features/projects/hooks/useProject"
import { ticketKeyWidth } from "@/features/tickets/lib/ticketKeyWidth"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

const routeApi = getRouteApi("/_authed/orgs/$orgSlug/projects/$slug")

export function ProjectLayout() {
  const { orgSlug, slug } = routeApi.useParams()
  const req = projectRequest(orgSlug, slug)
  const projectResult = useAtomValue(project(req))
  const projectUpdate = useAtomValue(updateProject(req))
  const inSettings =
    useMatch({
      from: "/_authed/orgs/$orgSlug/projects/$slug/settings",
      shouldThrow: false
    }) !== undefined
  const onAbout =
    useMatch({
      from: "/_authed/orgs/$orgSlug/projects/$slug/about",
      shouldThrow: false
    }) !== undefined

  return Result.matchWithError(projectResult, {
    onInitial: () => <LoaderOverlay active />,
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
        <LocalProjectCopy />
        <LocalCopyGate>
          <div
            key={`${orgSlug}/${slug}`}
            data-page-banner={value.banner ? "" : undefined}
            className={cn(
              "relative isolate flex flex-1 flex-col gap-3",
              !inSettings && "pp-context-in"
            )}
            style={{ "--ticket-key-width": ticketKeyWidth(value) }}
          >
            <ProjectBanner
              orgSlug={orgSlug}
              slug={slug}
              banner={value.banner}
              waiting={waiting && projectUpdate.waiting}
              pageBackdrop
              cover={onAbout}
            />
            <Outlet />
            <RetainedProjectViews key={`${orgSlug}/${slug}`} />
          </div>
        </LocalCopyGate>
      </ProjectContext.Provider>
    )
  })
}

function ProjectGitStatePolling({ enabled }: { enabled: boolean }) {
  const { orgSlug, slug } = useProjectRoute()
  useProjectGitStatePolling(orgSlug, slug, enabled)
  return null
}
