import { useAtomSet, useAtomValue } from "@effect/atom-react"
import * as Atom from "effect/reactivity/Atom"
import { useCallback } from "react"

import {
  configureJiraMigration,
  jiraMigrationRequest
} from "@/features/jira/atoms/jiraMigration"
import {
  toJiraImportConfiguration,
  type JiraImportDraft
} from "@/features/jira/lib/draft"
import {
  isJiraReconnectError,
  isRevisionConflict
} from "@/features/jira/lib/errors"
import { errorMessage } from "@/lib/errorMessage"
import { mutationFailure } from "@/lib/mutationError"
import { m } from "@/paraglide/messages"

export type JiraDraftFailure = Readonly<{
  message: string
  remedy: "reload" | "reconnect" | null
}>

export type JiraImportDraftSave = Readonly<{
  persist: (draft: JiraImportDraft) => void
  saving: boolean
  failure: JiraDraftFailure | null
  dismiss: () => void
}>

export function useJiraImportDraft(
  orgSlug: string,
  migrationId: string
): JiraImportDraftSave {
  const mutation = configureJiraMigration(
    jiraMigrationRequest(orgSlug, migrationId)
  )
  const save = useAtomSet(mutation)
  const state = useAtomValue(mutation)
  const persist = useCallback(
    (draft: JiraImportDraft) => {
      const configuration = toJiraImportConfiguration(draft)
      if (configuration !== null) save({ configuration })
    },
    [save]
  )
  const dismiss = useCallback(() => save(Atom.Reset), [save])
  return {
    persist,
    saving: state.waiting,
    failure: mutationFailure(
      state,
      (error): JiraDraftFailure => ({
        message: isRevisionConflict(error)
          ? m.jira_import_error_changed_elsewhere()
          : errorMessage(error),
        remedy: isRevisionConflict(error)
          ? "reload"
          : isJiraReconnectError(error)
            ? "reconnect"
            : null
      }),
      (): JiraDraftFailure => ({
        message: m.jira_import_error_unexpected(),
        remedy: null
      })
    ),
    dismiss
  }
}
