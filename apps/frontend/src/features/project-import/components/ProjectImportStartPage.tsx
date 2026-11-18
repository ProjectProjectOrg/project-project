import { useAtomSet, useAtomValue } from "@effect/atom-react"
import { Button } from "@pp/ui/button"
import { Upload } from "@pp/ui/icons"
import { getRouteApi, useNavigate } from "@tanstack/react-router"
import * as Exit from "effect/Exit"
import { useRef, useState } from "react"

import { StepFrame } from "@/components/shell/wizard/StepFrame"
import {
  projectImportOrgRequest,
  uploadProjectImport
} from "@/features/project-import/atoms/projectImport"
import { projectImportErrorMessage } from "@/features/project-import/lib/presentation"
import { mutationErrorText } from "@/lib/mutationError"
import { m } from "@/paraglide/messages"

import { ProjectImportShell } from "./ProjectImportShell"

const routeApi = getRouteApi("/_authed/orgs/$orgSlug/imports/projectproject/")

export function ProjectImportStartPage() {
  const { orgSlug } = routeApi.useParams()
  const req = projectImportOrgRequest(orgSlug)
  const upload = useAtomSet(uploadProjectImport(req), { mode: "promiseExit" })
  const uploadState = useAtomValue(uploadProjectImport(req))
  const navigate = useNavigate()
  const fileRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const uploading = uploadState.waiting
  const error = mutationErrorText(
    uploadState,
    projectImportErrorMessage,
    m.project_import_upload_error
  )

  const take = async (file: File) => {
    const exit = await upload(file)
    if (Exit.isSuccess(exit)) {
      await navigate({
        to: "/orgs/$orgSlug/imports/projectproject/$importId",
        params: { orgSlug, importId: exit.value.id }
      })
    }
  }

  return (
    <ProjectImportShell orgSlug={orgSlug} stage="upload">
      <StepFrame
        title={m.project_import_upload_title()}
        description={m.project_import_upload_description()}
        waiting={uploading}
        error={error}
        nextLabel={m.project_import_action_choose_file()}
        showBack={false}
        onBack={() => {}}
        onNext={() => fileRef.current?.click()}
      >
        <div className="flex flex-col gap-6">
          <Button
            type="button"
            variant="dropzone"
            size="dropzone"
            data-dragging={dragging}
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
            onDragOver={(event) => {
              event.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault()
              setDragging(false)
              const file = event.dataTransfer.files[0]
              if (file && !uploading) void take(file)
            }}
          >
            <Upload
              className="mb-1 size-4 text-muted-foreground"
              strokeWidth={1.75}
            />
            <span className="text-body font-semibold">
              {uploading
                ? m.project_import_upload_waiting()
                : m.project_import_dropzone_title()}
            </span>
            <span className="text-caption text-muted-foreground">
              {uploading
                ? m.project_import_upload_waiting_hint()
                : m.project_import_dropzone_hint()}
            </span>
          </Button>
          <input
            ref={fileRef}
            hidden
            type="file"
            accept=".tar.gz,.tgz,application/gzip"
            onChange={(event) => {
              const file = event.target.files?.[0]
              event.target.value = ""
              if (file) void take(file)
            }}
          />
          <div className="grid gap-6 border-t border-border pt-6 sm:grid-cols-2">
            <ScopeList
              title={m.project_import_scope_included_title()}
              items={[
                m.project_import_scope_included_tickets(),
                m.project_import_scope_included_groups(),
                m.project_import_scope_included_setup(),
                m.project_import_scope_included_attachments(),
                m.project_import_scope_included_people()
              ]}
            />
            <ScopeList
              title={m.project_import_scope_excluded_title()}
              items={[
                m.project_import_scope_excluded_integrations(),
                m.project_import_scope_excluded_credentials(),
                m.project_import_scope_excluded_library()
              ]}
            />
          </div>
        </div>
      </StepFrame>
    </ProjectImportShell>
  )
}

function ScopeList({
  title,
  items
}: Readonly<{ title: string; items: ReadonlyArray<string> }>) {
  return (
    <section>
      <h3 className="text-body font-semibold text-foreground">{title}</h3>
      <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-body leading-6 text-muted-foreground">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </section>
  )
}
