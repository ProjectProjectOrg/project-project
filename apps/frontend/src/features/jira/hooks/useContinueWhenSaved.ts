import { useEffect, useState } from "react"

import type { JiraImportDraftSave } from "@/features/jira/hooks/useJiraImportDraft"

export function useContinueWhenSaved(
  { saving, failure }: Pick<JiraImportDraftSave, "saving" | "failure">,
  onContinue: () => void
) {
  const [pending, setPending] = useState(false)
  if (pending && failure !== null) setPending(false)
  useEffect(() => {
    if (pending && !saving && failure === null) onContinue()
  }, [pending, saving, failure, onContinue])
  return { pending, request: () => setPending(true) }
}
