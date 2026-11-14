import {
  GitBranch,
  Shapes,
  SlidersHorizontal,
  Users,
  Workflow
} from "lucide-react"

import { m } from "@/paraglide/messages"

export type SectionKey =
  | "general"
  | "team"
  | "workflow"
  | "types"
  | "integrations"

export type ProjectSettingsSection = Readonly<{
  key: SectionKey
  label: string
  icon: typeof SlidersHorizontal
}>

export const PROJECT_SETTINGS_SECTIONS: ReadonlyArray<ProjectSettingsSection> =
  [
    {
      key: "general",
      label: m.project_settings_general_tab(),
      icon: SlidersHorizontal
    },
    {
      key: "team",
      label: m.project_settings_team_tab(),
      icon: Users
    },
    {
      key: "workflow",
      label: m.project_settings_workflow_tab(),
      icon: Workflow
    },
    {
      key: "types",
      label: m.project_settings_types_tab(),
      icon: Shapes
    },
    {
      key: "integrations",
      label: m.project_settings_integrations_tab(),
      icon: GitBranch
    }
  ]
