import { useAtomSet, useAtomValue } from "@effect/atom-react"
import type { ProjectDetail as ProjectDetailType } from "@pp/shared"
import { Link } from "@tanstack/react-router"
import * as DateTime from "effect/DateTime"
import * as Result from "effect/reactivity/AsyncResult"
import { GitBranch, UserPlus, X } from "lucide-react"
import { useCallback } from "react"

import { useSidebarSection } from "@/components/shell/SidebarSlot"
import { projectGitStates } from "@/features/github/atoms/github"
import {
  projectRequest,
  updateProjectSetup
} from "@/features/projects/atoms/projects"
import {
  useProjectRoute,
  ProjectContext
} from "@/features/projects/hooks/useProject"
import { useProjectActor } from "@/lib/access"
import { m } from "@/paraglide/messages"

export function ProjectSetupSlot({ project }: { project: ProjectDetailType }) {
  const { orgSlug, slug } = useProjectRoute()
  const canManage = useProjectActor().call("projects", "updateSetup")
  const render = useCallback(
    () =>
      canManage ? (
        <ProjectContext value={projectRequest(orgSlug, slug)}>
          <ProjectSetupRail project={project} />
        </ProjectContext>
      ) : null,
    [orgSlug, slug, project, canManage]
  )
  useSidebarSection(`project-setup:${orgSlug}/${slug}`, render)
  return null
}

function ProjectSetupRail({ project }: { project: ProjectDetailType }) {
  const { orgSlug, slug } = useProjectRoute()
  const req = projectRequest(orgSlug, slug)
  const gitStates = useAtomValue(projectGitStates(req))
  const updateSetup = useAtomSet(updateProjectSetup(req))

  const brokenGithub =
    Result.isSuccess(gitStates) &&
    (gitStates.value.tokenStatus !== "ok" ||
      gitStates.value.repoStatus === "gone")
  const items = [
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
                className="flex items-center gap-2.5 rounded-lg px-3 py-2 pr-8 text-[13px] text-muted-foreground transition-colors hover:bg-hover hover:text-foreground"
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
                  className="absolute top-1/2 right-1.5 grid size-6 -translate-y-1/2 place-items-center rounded-md text-muted-foreground opacity-0 transition-colors transition-transform duration-100 group-hover/setup-row:opacity-100 hover:bg-background hover:text-foreground active:scale-[0.97]"
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
