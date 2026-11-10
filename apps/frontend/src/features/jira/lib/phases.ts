import { m } from "@/paraglide/messages"

export const jiraScanPhases = [
  "queued_scan",
  "scan_issues",
  "scan_details",
  "scan_boards",
  "scan_finalize"
] as const

export const jiraImportPhases = [
  "migrate",
  "import_prepare",
  "import_attachments",
  "import_documents",
  "import_verify",
  "import_publish"
] as const

const labels = new Map<string, () => string>(
  Object.entries({
    queued_scan: m.jira_import_phase_queued,
    scan: m.jira_import_phase_scan,
    scan_issues: m.jira_import_phase_scan_issues,
    scan_details: m.jira_import_phase_scan_details,
    scan_boards: m.jira_import_phase_scan_boards,
    scan_finalize: m.jira_import_phase_scan_finalize,
    configuration: m.jira_import_phase_setup,
    ready: m.jira_import_phase_setup,
    migrate: m.jira_import_phase_starting,
    import: m.jira_import_phase_import,
    import_prepare: m.jira_import_phase_import_prepare,
    import_attachments: m.jira_import_phase_import_attachments,
    import_documents: m.jira_import_phase_import_documents,
    import_verify: m.jira_import_phase_import_verify,
    import_publish: m.jira_import_phase_import_publish,
    publish: m.jira_import_phase_import_publish,
    cancelling: m.jira_import_phase_cancelling,
    cancelled: m.jira_import_phase_cancelled,
    done: m.jira_import_phase_finished,
    finished: m.jira_import_phase_finished
  })
)

export const jiraImportPhaseLabel = (phase: string): string =>
  (labels.get(phase) ?? m.jira_import_phase_working)()

export type JiraPhaseStep = Readonly<{
  phase: string
  state: "done" | "current" | "pending"
  measured: boolean
}>

export type JiraPhaseProgress = Readonly<{
  phase: string
  done: number
  total: number | null
}>

const familyPrefix = (sequence: ReadonlyArray<string>): string | null => {
  const last = sequence.at(-1)
  const separator = last?.indexOf("_") ?? -1
  return last === undefined || separator <= 0
    ? null
    : last.slice(0, separator + 1)
}

const positionOf = (sequence: ReadonlyArray<string>, phase: string): number => {
  const index = sequence.indexOf(phase)
  if (index !== -1) return index
  const prefix = familyPrefix(sequence)
  return prefix !== null && phase.startsWith(prefix) ? sequence.length - 1 : -1
}

const isWaiting = (phase: string) => phase.startsWith("queued_")

export function jiraPhaseSteps(
  sequence: ReadonlyArray<string>,
  progress: JiraPhaseProgress
): ReadonlyArray<JiraPhaseStep> {
  const position = positionOf(sequence, progress.phase)
  if (position === -1)
    return [{ phase: progress.phase, state: "current", measured: true }]
  const complete =
    progress.total !== null &&
    progress.total > 0 &&
    progress.done >= progress.total
  const active = complete ? position + 1 : position
  return sequence.flatMap((phase, index): ReadonlyArray<JiraPhaseStep> => {
    if (index === 0 && isWaiting(phase) && position > 0) return []
    if (index < active) return [{ phase, state: "done", measured: false }]
    if (index === active)
      return [{ phase, state: "current", measured: !complete }]
    return [{ phase, state: "pending", measured: false }]
  })
}
