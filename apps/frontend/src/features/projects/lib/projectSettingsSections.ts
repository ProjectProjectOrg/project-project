import {
  GitBranch,
  Shapes,
  SlidersHorizontal,
  TriangleAlert,
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
  | "danger"

export type ProjectSettingsSection = Readonly<{
  key: SectionKey
  label: string
  icon: typeof SlidersHorizontal
  heading: string
  description: string
}>

export const PROJECT_SETTINGS_SECTIONS: ReadonlyArray<ProjectSettingsSection> =
  [
    {
      key: "general",
      label: m.project_settings_general_tab(),
      icon: SlidersHorizontal,
      heading: m.project_settings_general_heading(),
      description: m.project_settings_general_description()
    },
    {
      key: "team",
      label: m.project_settings_team_tab(),
      icon: Users,
      heading: m.project_settings_team_heading(),
      description: m.project_settings_team_description()
    },
    {
      key: "workflow",
      label: m.project_settings_workflow_tab(),
      icon: Workflow,
      heading: m.project_settings_workflow_heading(),
      description: m.project_settings_workflow_description()
    },
    {
      key: "types",
      label: m.project_settings_types_tab(),
      icon: Shapes,
      heading: m.project_settings_types_heading(),
      description: m.project_settings_types_description()
    },
    {
      key: "integrations",
      label: m.project_settings_integrations_tab(),
      icon: GitBranch,
      heading: m.project_settings_integrations_heading(),
      description: m.project_settings_integrations_description()
    },
    {
      key: "danger",
      label: m.project_settings_danger_tab(),
      icon: TriangleAlert,
      heading: m.project_settings_danger_heading(),
      description: m.project_settings_danger_description()
    }
  ]
