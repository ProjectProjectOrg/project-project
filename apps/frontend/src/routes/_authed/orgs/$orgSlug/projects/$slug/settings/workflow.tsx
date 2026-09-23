import { useAtomSet, useAtomValue } from "@effect/atom-react"
import { createFileRoute } from "@tanstack/react-router"
import * as DateTime from "effect/DateTime"

import { StatusList } from "@/components/StatusList"
import { Button } from "@/components/ui/button"
import {
  projectRequest,
  updateProjectSetup
} from "@/features/projects/atoms/projects"
import { useProjectRole } from "@/lib/projectRole"
import { m } from "@/paraglide/messages"
import { getLocale } from "@/paraglide/runtime"

import { useProject } from "../-context"

export const Route = createFileRoute(
  "/_authed/orgs/$orgSlug/projects/$slug/settings/workflow"
)({
  component: WorkflowSettings,
  loader: () => ({
    crumb: { type: "static" as const, label: m.project_settings_workflow_tab() }
  })
})

function WorkflowSettings() {
  const { orgSlug } = Route.useParams()
  const project = useProject()
  const req = projectRequest(orgSlug, project.slug)
  const update = useAtomSet(updateProjectSetup(req))
  const updateState = useAtomValue(updateProjectSetup(req))
  const { role } = useProjectRole()
  const canEdit = role === "owner" || role === "admin"
  const reviewedAt = project.setup.workflowReviewedAt

  return (
    <div className="flex w-full flex-col gap-8">
      <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-background px-4 py-3">
        <div>
          <p className="text-sm font-medium">
            {m.project_settings_workflow_review_label()}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {reviewedAt
              ? m.project_settings_workflow_reviewed_at({
                  when: new Intl.DateTimeFormat(getLocale(), {
                    dateStyle: "medium",
                    timeStyle: "short"
                  }).format(reviewedAt)
                })
              : m.project_settings_workflow_not_reviewed()}
          </p>
        </div>
        {canEdit ? (
          <Button
            type="button"
            variant="secondary"
            disabled={updateState.waiting}
            onClick={() =>
              update({
                workflowReviewedAt: reviewedAt
                  ? null
                  : DateTime.toDate(DateTime.nowUnsafe())
              })
            }
          >
            {reviewedAt
              ? m.project_settings_workflow_mark_unreviewed()
              : m.project_settings_workflow_mark_reviewed()}
          </Button>
        ) : null}
      </div>

      <div className="flex w-full flex-col gap-3">
        <div>
          <p className="text-sm font-medium">
            {m.project_settings_workflow_statuses_label()}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {m.project_settings_workflow_statuses_description()}
          </p>
        </div>
        <StatusList orgSlug={orgSlug} slug={project.slug} />
      </div>
    </div>
  )
}
