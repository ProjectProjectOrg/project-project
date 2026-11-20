import { useAtomSet } from "@effect/atom-react"
import { ProjectPolicy } from "@pp/access/policies"
import type { ProjectDetail } from "@pp/shared"
import * as Cause from "effect/Cause"
import * as Exit from "effect/Exit"

import { PageContainer } from "@/components/shell/Page"
import { EditableMarkdown } from "@/features/editor/components/EditableMarkdown"
import { updateProject } from "@/features/projects/atoms/projects"
import { AboutGoTo } from "@/features/projects/components/about/AboutGoTo"
import { AboutLinks } from "@/features/projects/components/about/AboutLinks"
import { AboutRepositories } from "@/features/projects/components/about/AboutRepositories"
import { AboutTeam } from "@/features/projects/components/about/AboutTeam"
import {
  useProject,
  useProjectRoute
} from "@/features/projects/hooks/useProject"
import { isBlankAbout } from "@/features/projects/lib/aboutTemplate"
import { useProjectActor } from "@/hooks/useActor"
import { m } from "@/paraglide/messages"

export function AboutTab() {
  const project = useProject()
  const canEdit = ProjectPolicy.canUpdate(useProjectActor(), { body: true })

  return (
    <PageContainer>
      <div className="grid grid-cols-1 gap-x-16 gap-y-8 lg:grid-cols-[minmax(0,42rem)_18rem] lg:justify-between">
        <AboutDescription project={project} canEdit={canEdit} />
        <aside className="flex min-w-0 flex-col gap-6 lg:sticky lg:top-6 lg:self-start lg:pt-2">
          <AboutTeam
            members={project.members}
            pendingMembers={project.pendingMembers}
          />
          <AboutLinks links={project.links} canEdit={canEdit} />
          <AboutRepositories repos={project.githubRepos} />
          <AboutGoTo />
        </aside>
      </div>
    </PageContainer>
  )
}

function AboutDescription({
  project,
  canEdit
}: Readonly<{ project: ProjectDetail; canEdit: boolean }>) {
  const { projectReq } = useProjectRoute()
  const update = useAtomSet(updateProject(projectReq), {
    mode: "promiseExit"
  })
  return (
    <EditableMarkdown
      markdown={project.body}
      editorKey={project.slug}
      canEdit={canEdit}
      blank={isBlankAbout(project.body, project.name)}
      placeholder={m.project_about_placeholder()}
      onSave={async (next) => {
        const exit = await update({ body: next })
        if (Exit.isFailure(exit)) throw Cause.squash(exit.cause)
      }}
    />
  )
}
