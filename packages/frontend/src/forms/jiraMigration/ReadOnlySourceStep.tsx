import type { JiraMigrationScanSummary } from "@projectproject/shared"
import { Globe2, KeyRound } from "lucide-react"
import { m } from "@/paraglide/messages"
import { MappingLabel, MappingRow } from "./MappingRow"
import { StepFrame } from "./StepFrame"

export function ReadOnlySourceStep({
  screen,
  summary,
  onBack,
  onNext
}: {
  screen: "connect" | "choose"
  summary: JiraMigrationScanSummary
  onBack: () => void
  onNext: () => void
}) {
  const connected = screen === "connect"
  return (
    <StepFrame
      title={
        connected
          ? m.jira_migration_connected_source_title()
          : m.jira_migration_selected_source_title()
      }
      description={
        connected
          ? m.jira_migration_connected_source_description()
          : m.jira_migration_selected_source_description()
      }
      waiting={false}
      error={null}
      showBack={!connected}
      onBack={onBack}
      onNext={onNext}
    >
      <div className="divide-y divide-border border-y border-border">
        {connected ? (
          <MappingRow
            source={
              <MappingLabel
                icon={<Globe2 className="size-4" strokeWidth={1.75} />}
              >
                {summary.siteName}
              </MappingLabel>
            }
            detail={summary.siteUrl}
          >
            <span className="text-right text-xs text-muted-foreground">
              {m.jira_migration_source_fixed()}
            </span>
          </MappingRow>
        ) : (
          <MappingRow
            source={
              <MappingLabel
                icon={<KeyRound className="size-4" strokeWidth={1.75} />}
              >
                {summary.projectName}
              </MappingLabel>
            }
            detail={summary.projectKey}
          >
            <span className="truncate text-right text-xs text-muted-foreground">
              {summary.siteName}
            </span>
          </MappingRow>
        )}
      </div>
      <p className="text-xs leading-5 text-muted-foreground">
        {m.jira_migration_source_fixed_note()}
      </p>
    </StepFrame>
  )
}
