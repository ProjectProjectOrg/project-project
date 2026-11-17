import { useAtomRefresh, useAtomValue } from "@effect/atom-react"
import type { ProjectImport } from "@pp/shared"
import { getRouteApi } from "@tanstack/react-router"

import { AsyncView } from "@/components/shell/AsyncView"
import {
  projectImport,
  projectImportRequest
} from "@/features/project-import/atoms/projectImport"
import { ProjectImportWizard } from "@/features/project-import/forms/project-import"
import { useVisibleInterval } from "@/hooks/useVisibleInterval"

import {
  projectImportStageForStatus,
  ProjectImportShell
} from "./ProjectImportShell"
import { ProjectImportTerminalStep } from "./ProjectImportTerminalStep"

const routeApi = getRouteApi(
  "/_authed/orgs/$orgSlug/imports/projectproject/$importId"
)

const POLL_INTERVAL_MS = 2_000

export function ProjectImportPage() {
  const { orgSlug, importId } = routeApi.useParams()
  const importAtom = projectImport(projectImportRequest(orgSlug, importId))
  const result = useAtomValue(importAtom)
  const refresh = useAtomRefresh(importAtom)

  return (
    <AsyncView
      result={result}
      reset={refresh}
      onInitial={() => (
        <ProjectImportShell orgSlug={orgSlug} stage="people">
          <ImportSkeleton />
        </ProjectImportShell>
      )}
      onSuccess={({ value }) => (
        <ImportScreen orgSlug={orgSlug} imported={value} refresh={refresh} />
      )}
    />
  )
}

function ImportScreen({
  orgSlug,
  imported,
  refresh
}: Readonly<{
  orgSlug: string
  imported: ProjectImport
  refresh: () => void
}>) {
  const inProgress =
    imported.status === "uploading" || imported.status === "importing"
  useVisibleInterval(refresh, POLL_INTERVAL_MS, inProgress)

  if (imported.source === null) {
    return (
      <ProjectImportShell
        orgSlug={orgSlug}
        stage={
          imported.status === "failed"
            ? "upload"
            : projectImportStageForStatus(imported.status)
        }
      >
        <ProjectImportTerminalStep orgSlug={orgSlug} imported={imported} />
      </ProjectImportShell>
    )
  }

  return (
    <ProjectImportWizard
      key={imported.id}
      orgSlug={orgSlug}
      imported={imported}
      source={imported.source}
    />
  )
}

function ImportSkeleton() {
  return (
    <div className="flex min-h-[520px] flex-col gap-6 py-1">
      <div className="skeleton h-7 w-64 rounded-lg" />
      <div className="skeleton h-4 w-full max-w-lg rounded" />
      <div className="skeleton mt-3 h-24 w-full rounded-xl" />
    </div>
  )
}
