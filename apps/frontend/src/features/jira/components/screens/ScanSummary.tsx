import type { JiraMigrationFinding, JiraMigrationScanSummary } from "@pp/shared"

import { Button } from "@/components/ui/button"
import { scanFacts } from "@/features/jira/lib/facts"
import { formatDateTime, formatNumber } from "@/features/jira/lib/format"
import { jiraVisibility } from "@/features/jira/lib/warnings"
import { m } from "@/paraglide/messages"

import { ConfirmAction } from "../ConfirmAction"
import { FactBlock, FactList, FactRow } from "../Facts"
import { JiraFindings } from "../Findings"
import { StepFrame } from "../StepFrame"

export function ScanSummary({
  summary,
  findings,
  canRescan,
  waiting,
  error,
  onRescan,
  onContinue
}: Readonly<{
  summary: JiraMigrationScanSummary
  findings: ReadonlyArray<JiraMigrationFinding>
  canRescan: boolean
  waiting: boolean
  error: string | null
  onRescan: () => Promise<boolean>
  onContinue: () => void
}>) {
  const counts = summary.counts
  const visibility = jiraVisibility(summary.visibilityWarnings)
  return (
    <StepFrame
      title={m.jira_import_scan_summary_title({
        project: summary.projectName
      })}
      description={m.jira_import_scan_summary_description({
        site: summary.siteName,
        time: formatDateTime(summary.scannedAt)
      })}
      start={
        canRescan ? (
          <ConfirmAction
            variant="ghost"
            bleed="start"
            trigger={m.jira_import_action_scan_again()}
            prompt={m.jira_import_scan_again_prompt()}
            label={m.jira_import_action_scan_again()}
            tone="neutral"
            disabled={waiting}
            onConfirm={onRescan}
          />
        ) : undefined
      }
      error={error}
      end={
        <Button onClick={onContinue}>{m.jira_import_action_to_setup()}</Button>
      }
    >
      <div className="flex flex-col gap-10">
        <FactBlock title={m.jira_import_scan_found_title()}>
          <FactList>
            {scanFacts(counts).map(({ label, value }) => (
              <FactRow key={label} label={label}>
                {formatNumber(value)}
              </FactRow>
            ))}
          </FactList>
          {visibility.kind === "limited" ? null : (
            <p className="pt-1 text-[13px] text-muted-foreground">
              {visibility.kind === "complete"
                ? m.jira_import_scan_visibility_none()
                : m.jira_import_scan_visibility_account()}
            </p>
          )}
        </FactBlock>
        {visibility.kind === "limited" ? (
          <FactBlock
            title={m.jira_import_scan_visibility_title()}
            description={m.jira_import_scan_visibility_description()}
          >
            <FactList>
              {visibility.rows.map((row) => (
                <FactRow key={`${row.label}:${row.detail}`} label={row.label}>
                  {row.detail}
                </FactRow>
              ))}
            </FactList>
          </FactBlock>
        ) : null}
        {findings.length === 0 ? null : (
          <FactBlock
            title={m.jira_import_scan_findings_title()}
            description={m.jira_import_scan_findings_description()}
          >
            <JiraFindings findings={findings} project={null} />
          </FactBlock>
        )}
      </div>
    </StepFrame>
  )
}
