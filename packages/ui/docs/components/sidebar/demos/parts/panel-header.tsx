import { SidebarPanelHeader } from "@pp/ui/sidebar"

import type { Project } from "../data"
import { SprintIcon } from "./marks"

// One header for every place, in the panel's header slot (as in the app).
export function PanelHeader({
  project
}: Readonly<{ project: Project | undefined }>) {
  return project === undefined ? (
    <SidebarPanelHeader title="Dashboard" subtitle="project-project" />
  ) : (
    <SidebarPanelHeader
      title={project.name}
      subtitle={project.sprint ?? project.key}
      subtitleIcon={
        project.sprint ? (
          <SprintIcon state="active" className="size-3" />
        ) : undefined
      }
    />
  )
}
