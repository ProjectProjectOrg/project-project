import { useAtomSet, useAtomValue } from "@effect/atom-react"
import type { ProjectDetail as ProjectDetailType } from "@pp/shared"
import { GitBranch, UserPlus, X } from "@pp/ui/icons"
import { Link } from "@tanstack/react-router"
import * as DateTime from "effect/DateTime"
import * as Result from "effect/reactivity/AsyncResult"

import { projectGitStates } from "@/features/github/atoms/github"
import {
  project,
  projectRequest,
  updateProjectSetup
} from "@/features/projects/atoms/projects"
import { useProjectRoute } from "@/features/projects/hooks/useProject"
import { useProjectActor } from "@/hooks/useActor"
import { m } from "@/paraglide/messages"

export function ProjectSetupLine() {
  const { orgSlug, slug } = useProjectRoute()
  const req = projectRequest(orgSlug, slug)
  const canManage = useProjectActor().call("projects", "updateSetup")
  const projectResult = useAtomValue(project(req))
  if (!canManage || !Result.isSuccess(projectResult)) return null
  return <SetupLine detail={projectResult.value} />
}

function SetupLine({ detail }: { detail: ProjectDetailType }) {
  const { orgSlug, slug } = useProjectRoute()
  const req = projectRequest(orgSlug, slug)
  const gitStates = useAtomValue(projectGitStates(req))
  const updateSetup = useAtomSet(updateProjectSetup(req))

  const brokenGithub =
    Result.isSuccess(gitStates) &&
    (gitStates.value.tokenStatus !== "ok" ||
      gitStates.value.repoStatus === "gone")
  const items = [
    detail.members.length < 2 && !detail.setup.invitePeopleDismissedAt
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
    brokenGithub || (!detail.github && !detail.setup.connectGithubDismissedAt)
      ? {
          key: "github",
          to: "/orgs/$orgSlug/projects/$slug/settings/integrations" as const,
          label: m.project_setup_connect_github(),
          icon: GitBranch,
          dismiss: detail.github
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

  const [next] = items
  if (!next) return null
  const Icon = next.icon

  return (
    <div
      data-nav-skip
      className="group/setup-line flex items-center gap-2 border-t border-border/60 px-3 py-2 text-caption text-muted-foreground"
    >
      <Link
        to={next.to}
        params={{ orgSlug, slug }}
        className="flex min-w-0 flex-1 items-center gap-2 rounded-sm transition-colors outline-none hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring"
      >
        <Icon className="size-3.5 shrink-0" strokeWidth={1.75} />
        <span className="truncate">{next.label}</span>
        {items.length > 1 ? (
          <span className="shrink-0 tabular-nums">+{items.length - 1}</span>
        ) : null}
      </Link>
      {next.dismiss ? (
        <button
          type="button"
          aria-label={m.project_setup_dismiss_aria_label({ item: next.label })}
          onClick={next.dismiss}
          className="grid size-5 shrink-0 place-items-center rounded-md opacity-0 transition-[opacity,color] duration-100 group-hover/setup-line:opacity-100 hover:text-foreground focus-visible:opacity-100 pointer-coarse:opacity-100"
        >
          <X className="size-3" strokeWidth={1.75} />
        </button>
      ) : null}
    </div>
  )
}
