import type { JiraMigrationConfiguration } from "@pp/shared"
import { useEffect, useState } from "react"

import type { JiraImportForm } from "@/features/jira/forms/import/opts"
import {
  configurationBehind,
  type JiraImportDraft
} from "@/features/jira/lib/draft"

export function useSyncDraftOnOpen(
  form: JiraImportForm,
  saved: JiraMigrationConfiguration | null,
  persist: (draft: JiraImportDraft) => void
): void {
  const [behind] = useState(() => configurationBehind(form.state.values, saved))
  useEffect(() => {
    if (behind) persist(form.state.values)
  }, [behind, persist, form])
}
