import { useAtomValue } from "@effect/atom-react"
import type { ProjectDetail } from "@pp/shared"
import { Outlet } from "@tanstack/react-router"
import * as Match from "effect/Match"
import * as Result from "effect/reactivity/AsyncResult"
import type { ReactNode } from "react"

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
import { RetainedProjectViews } from "@/features/projects/components/RetainedProjectViews"
import {
  ProjectContext,
  useProjectRoute
} from "@/features/projects/hooks/useProject"
import { useWarmProjectViews } from "@/features/projects/hooks/useWarmProjectViews"
import { ticketKeyWidth } from "@/features/tickets/lib/ticketKeyWidth"
import { m } from "@/paraglide/messages"

type ProjectParams = Readonly<{ orgSlug: string; slug: string }>

export function ProjectLayout({ orgSlug, slug }: ProjectParams) {
  const projectUpdate = useAtomValue(
    updateProject(projectRequest(orgSlug, slug))
  )
  useWarmProjectViews(orgSlug, slug)
  return (
    <ProjectScope orgSlug={orgSlug} slug={slug}>
      {(value, waiting) => (
        <>
          <ProjectGitStatePolling enabled={value.github !== null} />
          <div
            key={`${orgSlug}/${slug}`}
            data-page-banner={value.banner ? "" : undefined}
            className="relative isolate flex flex-1 flex-col gap-3"
            style={{ "--ticket-key-width": ticketKeyWidth(value) }}
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
        </>
      )}
    </ProjectScope>
  )
}

// A project's settings: the project's context without its banner and views.
export function ProjectSettingsLayout({ orgSlug, slug }: ProjectParams) {
  return (
    <ProjectScope orgSlug={orgSlug} slug={slug}>
      {() => <Outlet />}
    </ProjectScope>
  )
}

// Loads a project and provides it to everything under it, or shows why it
// can't.
function ProjectScope({
  orgSlug,
  slug,
  children
}: ProjectParams &
  Readonly<{
    children: (value: ProjectDetail, waiting: boolean) => ReactNode
  }>) {
  const req = projectRequest(orgSlug, slug)
  const projectResult = useAtomValue(project(req))

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
        {children(value, waiting)}
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
      <div className="h-12 skeleton rounded-lg bg-muted/60" />
      <div className="h-9 skeleton rounded-lg bg-muted/60" />
      <div className="h-40 skeleton rounded-xl bg-muted/60" />
    </div>
  )
}
