import type { ProjectImportStatus } from "@pp/shared"
import { Button } from "@pp/ui/button"
import { Link } from "@tanstack/react-router"
import type { ReactNode } from "react"

import {
  type WizardNavigation,
  WizardShell
} from "@/components/shell/wizard/WizardShell"
import { m } from "@/paraglide/messages"

const projectImportStages = [
  { id: "upload", label: m.project_import_stage_upload },
  { id: "people", label: m.project_import_stage_people },
  { id: "destination", label: m.project_import_stage_destination },
  { id: "review", label: m.project_import_stage_review },
  { id: "import", label: m.project_import_stage_import },
  { id: "finish", label: m.project_import_stage_finish }
] as const

export type ProjectImportStage = (typeof projectImportStages)[number]["id"]

const stageForStatus = {
  uploading: "upload",
  ready: "people",
  importing: "import",
  failed: "finish",
  cancelled: "finish",
  succeeded: "finish"
} as const satisfies Record<ProjectImportStatus, ProjectImportStage>

export const projectImportStageForStatus = (status: ProjectImportStatus) =>
  stageForStatus[status]

export function ProjectImportShell<Navigable extends ProjectImportStage>({
  orgSlug,
  stage,
  furthestStage,
  navigation,
  action,
  children
}: Readonly<{
  orgSlug: string
  stage: ProjectImportStage
  furthestStage?: ProjectImportStage
  navigation?: WizardNavigation<Navigable>
  action?: ReactNode
  children: ReactNode
}>) {
  return (
    <WizardShell
      title={m.project_import_page_title()}
      stages={projectImportStages}
      currentStage={stage}
      furthestStage={furthestStage}
      navigation={navigation}
      action={
        action ?? (
          <Button
            variant="ghost"
            render={<Link to="/orgs/$orgSlug/projects" params={{ orgSlug }} />}
          >
            {m.project_import_action_back_to_projects()}
          </Button>
        )
      }
    >
      {children}
    </WizardShell>
  )
}
