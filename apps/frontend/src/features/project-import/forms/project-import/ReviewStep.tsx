import type { ProjectImport } from "@pp/shared"

import { StepFrame } from "@/components/shell/wizard/StepFrame"
import { integrationList } from "@/features/project-import/lib/presentation"
import { m } from "@/paraglide/messages"
import { getLocale } from "@/paraglide/runtime"

import type { ProjectImportForm } from "./opts"

export function ReviewStep({
  form,
  imported,
  sourceKey,
  waiting,
  error,
  onBack,
  onNext
}: Readonly<{
  form: ProjectImportForm
  imported: ProjectImport
  sourceKey: string
  waiting: boolean
  error: string | null
  onBack: () => void
  onNext: () => void
}>) {
  const format = new Intl.NumberFormat(getLocale())
  const counts = [
    {
      label: m.project_import_review_tickets(),
      value: imported.counts.tickets
    },
    { label: m.project_import_review_groups(), value: imported.counts.groups },
    {
      label: m.project_import_review_attachments(),
      value: imported.counts.attachments
    },
    {
      label: m.project_import_review_activity(),
      value: imported.counts.activity
    }
  ]
  const notes = [
    ...(imported.counts.missingAttachments > 0
      ? [
          m.project_import_review_missing_attachments({
            count: format.format(imported.counts.missingAttachments)
          })
        ]
      : []),
    ...(imported.integrations.length > 0
      ? [
          m.project_import_review_integrations({
            integrations: integrationList(imported.integrations)
          })
        ]
      : []),
    m.project_import_review_not_imported(),
    m.project_import_review_ids({ key: sourceKey })
  ]

  return (
    <StepFrame
      title={m.project_import_review_title()}
      description={m.project_import_review_description()}
      waiting={waiting}
      error={error}
      nextLabel={
        imported.status === "failed"
          ? m.project_import_action_retry()
          : m.project_import_action_run()
      }
      onBack={onBack}
      onNext={onNext}
    >
      <div className="space-y-7">
        <div className="border-y border-border py-4">
          <div className="text-caption text-muted-foreground">
            {m.project_import_destination_name()}
          </div>
          <form.Subscribe selector={(state) => state.values.destination}>
            {(destination) => (
              <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="font-semibold">{destination.name}</span>
                <span className="text-caption text-muted-foreground tabular-nums">
                  {destination.key} · {destination.slug}
                </span>
              </div>
            )}
          </form.Subscribe>
        </div>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {counts.map(({ label, value }) => (
            <div
              key={label}
              className="rounded-lg border border-border px-3 py-2.5"
            >
              <dt className="text-caption text-muted-foreground">{label}</dt>
              <dd className="mt-0.5 text-subtitle font-semibold text-foreground tabular-nums">
                {format.format(value)}
              </dd>
            </div>
          ))}
        </dl>
        {imported.types.length > 0 && (
          <div className="space-y-2">
            <p className="text-body font-semibold">
              {m.project_import_review_types()}
            </p>
            <ul className="text-body text-muted-foreground">
              {imported.types.map((type) => (
                <li key={type.sourceKey}>
                  {type.name}{" "}
                  <span className="text-caption tabular-nums">{type.key}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <ul className="flex list-disc flex-col gap-1.5 pl-5 text-body leading-6 text-muted-foreground">
          {notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      </div>
    </StepFrame>
  )
}
