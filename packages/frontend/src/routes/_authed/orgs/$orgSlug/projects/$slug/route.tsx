import * as Result from "effect/unstable/reactivity/AsyncResult"
import { useAtomSet, useAtomValue } from "@effect/atom-react"
import { createFileRoute, Link, Outlet } from "@tanstack/react-router"
import * as DateTime from "effect/DateTime"
import { useCallback } from "react"
import { GitBranch, UserPlus, Workflow, X } from "lucide-react"
import { statusesFor, statusesRequest } from "@/atoms/projectStatuses"
import { useProjectRole } from "@/lib/projectRole"
import { useProjectGitStatePolling } from "@/hooks/useProjectGitStatePolling"
import {
  project,
  projectRequest,
  updateProject,
  updateProjectSetup
} from "@/atoms/projects"
import { countsRequest, ticketCounts } from "@/atoms/ticketCounts"
import { sprintList, sprintListRequest } from "@/atoms/sprintList"
import { projectGitStates } from "@/atoms/github"
import {
  everhourProjectRequest,
  everhourProjectStatusAtom
} from "@/atoms/everhour"
import { ProjectBanner } from "@/components/ProjectBanner"
import { RetainedProjectViews } from "@/components/RetainedProjectViews"
import { useSidebarSection } from "@/components/SidebarSlot"
import { cn } from "@/lib/utils"
import { ErrorPage } from "@/components/ErrorPage"
import { NotFoundPage } from "@/components/NotFoundPage"
import { PageContainer } from "@/components/page"
import { m } from "@/paraglide/messages"
import { ProjectContext } from "./-context"
import type { ProjectDetail as ProjectDetailType } from "@projectproject/shared"

export const Route = createFileRoute("/_authed/orgs/$orgSlug/projects/$slug")({
  component: ProjectLayout,
  loader: ({ context, params }) => {
    const { orgSlug, slug } = params
    const { registry } = context
    registry.mount(project(projectRequest(orgSlug, slug)))()
    registry.mount(ticketCounts(countsRequest(orgSlug, slug, {})))()
    registry.mount(sprintList(sprintListRequest(orgSlug, slug)))()
    registry.mount(statusesFor(statusesRequest(orgSlug, slug)))()
    registry.mount(
      everhourProjectStatusAtom(everhourProjectRequest(orgSlug, slug))
    )()
    return {
      crumb: [
        {
          type: "static" as const,
          label: m.chrome_sidebar_projects(),
          to: "/orgs/$orgSlug/projects",
          params: { orgSlug }
        },
        {
          type: "project" as const,
          orgSlug,
          slug
        }
      ]
    }
  }
})

function ProjectLayout() {
  const { orgSlug, slug } = Route.useParams()
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
      error._tag === "NotFound" ? (
        <NotFoundPage
          contained
          title={m.project_detail_not_found_title()}
          body={m.project_detail_not_found_body({ slug })}
        />
      ) : (
        <ErrorPage
          contained
          error={error}
          title={m.project_detail_load_error_title()}
          body={m.project_detail_load_error_body()}
        />
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
        <ProjectGitStatePolling
          orgSlug={orgSlug}
          slug={slug}
          enabled={value.github !== null}
        />
        <ProjectSetupSlot orgSlug={orgSlug} slug={slug} project={value} />
        <div className={cn("relative isolate flex flex-1 flex-col gap-3")}>
          <ProjectBanner
            orgSlug={orgSlug}
            slug={slug}
            banner={value.banner}
            waiting={waiting && projectUpdate.waiting}
          />
          <Outlet />
          <RetainedProjectViews
            key={`${orgSlug}/${slug}`}
            orgSlug={orgSlug}
            slug={slug}
          />
        </div>
      </ProjectContext.Provider>
    )
  })
}

function ProjectGitStatePolling({
  orgSlug,
  slug,
  enabled
}: {
  orgSlug: string
  slug: string
  enabled: boolean
}) {
  useProjectGitStatePolling(orgSlug, slug, enabled)
  return null
}

function ProjectSetupSlot({
  orgSlug,
  slug,
  project
}: {
  orgSlug: string
  slug: string
  project: ProjectDetailType
}) {
  const { role } = useProjectRole()
  const canManage = role === "owner" || role === "admin"
  const render = useCallback(
    () => (
      <ProjectSetupRail
        orgSlug={orgSlug}
        slug={slug}
        project={project}
        canManage={canManage}
      />
    ),
    [orgSlug, slug, project, canManage]
  )
  useSidebarSection(`project-setup:${orgSlug}/${slug}`, render)
  return null
}

function ProjectSetupRail({
  orgSlug,
  slug,
  project,
  canManage
}: {
  orgSlug: string
  slug: string
  project: ProjectDetailType
  canManage: boolean
}) {
  const req = projectRequest(orgSlug, slug)
  const gitStates = useAtomValue(projectGitStates(req))
  const updateSetup = useAtomSet(updateProjectSetup(req))
  if (!canManage) return null

  const brokenGithub =
    Result.isSuccess(gitStates) &&
    (gitStates.value.tokenStatus !== "ok" ||
      gitStates.value.repoStatus === "gone")
  const items = [
    !project.setup.workflowReviewedAt
      ? {
          key: "workflow",
          to: "/orgs/$orgSlug/projects/$slug/settings/workflow" as const,
          label: m.project_setup_review_workflow(),
          icon: Workflow,
          dismiss: null
        }
      : null,
    project.members.length < 2 && !project.setup.invitePeopleDismissedAt
      ? {
          key: "invite",
          to: "/orgs/$orgSlug/projects/$slug/settings/team" as const,
          label: m.project_setup_invite_people(),
          icon: UserPlus,
          dismiss: () =>
            updateSetup({
              invitePeopleDismissedAt: DateTime.toDate(DateTime.nowUnsafe())
            })
        }
      : null,
    brokenGithub || (!project.github && !project.setup.connectGithubDismissedAt)
      ? {
          key: "github",
          to: "/orgs/$orgSlug/projects/$slug/settings/integrations" as const,
          label: m.project_setup_connect_github(),
          icon: GitBranch,
          dismiss: project.github
            ? null
            : () =>
                updateSetup({
                  connectGithubDismissedAt: DateTime.toDate(
                    DateTime.nowUnsafe()
                  )
                })
        }
      : null
  ].filter((item) => item !== null)

  if (items.length === 0) return null

  return (
    <div className="flex flex-col gap-1 px-3 pt-6">
      <div className="px-3 pb-1 text-xs font-medium text-muted-foreground">
        {m.project_setup_section_label()}
      </div>
      <nav className="flex flex-col gap-1">
        {items.map((item) => {
          const Icon = item.icon
          return (
            <div key={item.key} className="group/setup-row relative">
              <Link
                to={item.to}
                params={{ orgSlug, slug }}
                className="flex items-center gap-2.5 rounded-lg px-3 py-2 pr-8 text-[13px] text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
              >
                <Icon className="size-4" strokeWidth={1.75} />
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
              </Link>
              {item.dismiss ? (
                <button
                  type="button"
                  aria-label={m.project_setup_dismiss_aria_label({
                    item: item.label
                  })}
                  onClick={item.dismiss}
                  className="absolute right-1.5 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-md text-muted-foreground opacity-0 transition-colors transition-transform duration-100 hover:bg-background hover:text-foreground group-hover/setup-row:opacity-100 active:scale-[0.97]"
                >
                  <X className="size-3.5" strokeWidth={1.75} />
                </button>
              ) : null}
            </div>
          )
        })}
      </nav>
    </div>
  )
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
