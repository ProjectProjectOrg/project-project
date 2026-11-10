import { useAtomSet, useAtomValue } from "@effect/atom-react"
import type { JiraMigrationDetail } from "@pp/shared"
import { useNavigate } from "@tanstack/react-router"
import * as Exit from "effect/Exit"

import {
  cancelJiraMigration,
  discardJiraMigration,
  jiraMigrationRequest,
  jiraOrgRequest,
  rescanJiraMigration,
  runJiraMigration
} from "@/features/jira/atoms/jiraMigration"
import { errorMessage } from "@/lib/errorMessage"
import { mutationErrorText } from "@/lib/mutationError"
import { m } from "@/paraglide/messages"

export type JiraImportLifecycle = Readonly<{
  run: () => Promise<boolean>
  rescan: () => Promise<boolean>
  cancel: () => Promise<boolean>
  discard: () => Promise<boolean>
  waiting: boolean
  error: string | null
}>

const jiraActionError = (
  result: Parameters<typeof mutationErrorText>[0]
): string | null =>
  mutationErrorText(result, errorMessage, m.jira_import_error_unexpected)

export function useJiraImportLifecycle(
  orgSlug: string,
  detail: Pick<JiraMigrationDetail, "id" | "revision">,
  onStarted?: () => void
): JiraImportLifecycle {
  const req = jiraMigrationRequest(orgSlug, detail.id)
  const discardKey = { req: jiraOrgRequest(orgSlug), migrationId: detail.id }
  const navigate = useNavigate()
  const runSet = useAtomSet(runJiraMigration(req), { mode: "promiseExit" })
  const rescanSet = useAtomSet(rescanJiraMigration(req), {
    mode: "promiseExit"
  })
  const cancelSet = useAtomSet(cancelJiraMigration(req), {
    mode: "promiseExit"
  })
  const discardSet = useAtomSet(discardJiraMigration(discardKey), {
    mode: "promiseExit"
  })
  const runState = useAtomValue(runJiraMigration(req))
  const rescanState = useAtomValue(rescanJiraMigration(req))
  const cancelState = useAtomValue(cancelJiraMigration(req))
  const discardState = useAtomValue(discardJiraMigration(discardKey))
  const expected = { expectedRevision: detail.revision }

  return {
    run: async () => {
      const started = Exit.isSuccess(await runSet(expected))
      if (started) onStarted?.()
      return started
    },
    rescan: async () => Exit.isSuccess(await rescanSet(expected)),
    cancel: async () => Exit.isSuccess(await cancelSet(expected)),
    discard: async () => {
      const exit = await discardSet(undefined)
      if (Exit.isFailure(exit)) return false
      await navigate({
        to: "/orgs/$orgSlug/migrations/jira",
        params: { orgSlug }
      })
      return true
    },
    waiting:
      runState.waiting ||
      rescanState.waiting ||
      cancelState.waiting ||
      discardState.waiting,
    error:
      jiraActionError(runState) ??
      jiraActionError(rescanState) ??
      jiraActionError(cancelState) ??
      jiraActionError(discardState)
  }
}
