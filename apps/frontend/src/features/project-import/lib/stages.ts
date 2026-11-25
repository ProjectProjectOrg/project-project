import type { ProjectImportStatus } from "@pp/shared"

import { m } from "@/paraglide/messages"

export const projectImportStages = [
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
