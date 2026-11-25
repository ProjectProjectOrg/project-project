import { Button } from "@pp/ui/button"
import { Link } from "@tanstack/react-router"
import type { ReactNode } from "react"

import {
  type WizardNavigation,
  WizardShell
} from "@/components/shell/wizard/WizardShell"
import { m } from "@/paraglide/messages"

import { projectImportStages, type ProjectImportStage } from "../lib/stages"

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
