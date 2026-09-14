import type {
  JiraMigrationRequirements,
  JiraMigrationScanSummary
} from "@projectproject/shared"
import { Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"
import type { JiraMigrationForm } from "./opts"
import { StepFrame } from "./StepFrame"

export function ReviewStep({
  form,
  requirements,
  summary,
  waiting,
  error,
  onBack,
  onNext
}: StepProps) {
  const forcedSkips = requirements.attachments.filter(
    (attachment) => attachment.forcedSkipReason !== null
  )

  return (
    <StepFrame
      title={m.jira_migration_review_title()}
      description={m.jira_migration_review_description()}
      waiting={waiting}
      error={error}
      nextLabel={m.jira_migration_action_start()}
      onBack={onBack}
      onNext={onNext}
    >
      <div className="space-y-7">
        <div className="rounded-xl border border-border bg-muted/30 p-4">
          <div className="text-xs text-muted-foreground">
            {m.jira_migration_destination_name()}
          </div>
          <form.Subscribe selector={(state) => state.values.destination}>
            {(destination) => (
              <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="font-medium">{destination.name}</span>
                <span className="font-mono text-xs text-muted-foreground">
                  {destination.key} · {destination.slug}
                </span>
              </div>
            )}
          </form.Subscribe>
          <div className="mt-3 font-mono text-xs text-muted-foreground">
            {m.jira_migration_review_counts({
              issues: summary.counts.issues,
              comments: summary.counts.comments,
              attachments: summary.counts.attachments
            })}
          </div>
        </div>

        <div>
          <h3 className="text-sm font-semibold">
            {m.jira_migration_restricted_title()}
          </h3>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {m.jira_migration_restricted_description()}
          </p>
          <form.Field name="restrictedContent">
            {(field) => (
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <ChoiceButton
                  selected={field.value.policy === "exclude"}
                  onClick={() => field.handleChange({ policy: "exclude" })}
                >
                  {m.jira_migration_restricted_exclude()}
                </ChoiceButton>
                <ChoiceButton
                  selected={field.value.policy === "include"}
                  onClick={() =>
                    field.handleChange({
                      policy: "include",
                      disclosureAccepted: true
                    })
                  }
                >
                  {m.jira_migration_restricted_include()}
                </ChoiceButton>
              </div>
            )}
          </form.Field>
        </div>

        {forcedSkips.length > 0 ? (
          <div>
            <h3 className="text-sm font-semibold">
              {m.jira_migration_attachments_title()}
            </h3>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {m.jira_migration_attachments_description()}
            </p>
            <ul className="mt-3 divide-y divide-border">
              {forcedSkips.map((attachment) => (
                <li
                  key={attachment.jiraAttachmentId}
                  className="flex items-center justify-between gap-4 py-2 text-sm"
                >
                  <span className="min-w-0 truncate">
                    {attachment.filename}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {m.jira_migration_attachment_forced()}
                  </span>
                </li>
              ))}
            </ul>
            <form.Field name="attachmentSkipsAccepted">
              {(field) => (
                <label className="mt-3 flex cursor-pointer items-start gap-3 rounded-xl border border-border p-3 text-sm transition-colors hover:bg-accent/60">
                  <input
                    type="checkbox"
                    checked={field.value}
                    className="mt-0.5 size-4 accent-primary"
                    onChange={(event) =>
                      field.handleChange(event.currentTarget.checked)
                    }
                  />
                  <span>{m.jira_migration_attachment_accept()}</span>
                </label>
              )}
            </form.Field>
          </div>
        ) : null}
      </div>
    </StepFrame>
  )
}

function ChoiceButton({
  selected,
  onClick,
  children
}: {
  selected: boolean
  onClick: () => void
  children: string
}) {
  return (
    <Button
      type="button"
      variant="tertiary"
      className={cn(
        "h-auto min-h-11 justify-start whitespace-normal py-2.5 text-left",
        selected && "border-foreground bg-accent"
      )}
      leadingIcon={selected ? Check : undefined}
      onClick={onClick}
    >
      {children}
    </Button>
  )
}

interface StepProps {
  form: JiraMigrationForm
  requirements: JiraMigrationRequirements
  summary: JiraMigrationScanSummary
  waiting: boolean
  error: string | null
  onBack: () => void
  onNext: () => void
}
