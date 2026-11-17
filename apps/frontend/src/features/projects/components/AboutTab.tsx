import { useAtomSet } from "@effect/atom-react"
import { ProjectPolicy } from "@pp/access/policies"
import type { ProjectDetail } from "@pp/shared"
import { LexicalEditor } from "@pp/ui/editor/lexical-editor"
import { Markdown } from "@pp/ui/editor/markdown"
import { type SaveStatus } from "@pp/ui/editor/save-queue"
import { useEditMode } from "@pp/ui/editor/use-edit-mode"
import { cn } from "@pp/ui/lib/utils"
import * as Cause from "effect/Cause"
import * as Exit from "effect/Exit"
import type { LexicalEditor as LexicalEditorType } from "lexical"
import { useRef, useState } from "react"

import { PageContainer } from "@/components/shell/Page"
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
import { DescriptionActions } from "@/features/tickets/components/ticket-page/DescriptionActions"
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
  const [status, setStatus] = useState<SaveStatus>("idle")
  const editorRef = useRef<LexicalEditorType | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const { editing, startEditing, stopEditing } = useEditMode({
    editorRef,
    rootRef
  })

  if (!canEdit) {
    return (
      <div className="min-w-0 px-3 py-2">
        <Markdown>{project.body}</Markdown>
      </div>
    )
  }

  const blank = isBlankAbout(project.body, project.name)

  return (
    <div
      ref={rootRef}
      role="presentation"
      tabIndex={-1}
      className={cn(
        "relative min-w-0 rounded-xl py-2 transition-[background-color,box-shadow] duration-150 ease-out outline-none motion-reduce:transition-none",
        editing &&
          "bg-surface-2 shadow-surface-1 [--muted-foreground:color-mix(in_oklch,var(--color-muted-foreground)_88%,var(--color-foreground))]"
      )}
    >
      <div
        role="presentation"
        className={cn(
          "relative px-3 [&_.lexical-content]:min-h-0",
          (editing || blank) && "cursor-text"
        )}
        onClick={(event) => {
          if (editing || !blank) return
          if (
            event.target instanceof Element &&
            event.target.closest("a, button, input, label")
          )
            return
          startEditing()
        }}
      >
        <div className="relative flow-root">
          <DescriptionActions
            editing={editing}
            status={status}
            onEdit={startEditing}
            onDone={stopEditing}
          />
          <LexicalEditor
            key={project.slug}
            markdown={project.body}
            onChange={async (next) => {
              const exit = await update({ body: next })
              if (Exit.isFailure(exit)) throw Cause.squash(exit.cause)
            }}
            onStatusChange={setStatus}
            placeholder={m.project_about_placeholder()}
            editorRef={editorRef}
            editable={editing}
          />
        </div>
      </div>
    </div>
  )
}
