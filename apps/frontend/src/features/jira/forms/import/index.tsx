import type {
  JiraMigrationConfiguration,
  JiraMigrationRequirements
} from "@pp/shared"
import { useState, type ReactNode } from "react"

import { buildJiraImportDraft } from "@/features/jira/lib/draft"
import { useAppForm } from "@/lib/form"

import { jiraImportFormOpts, type JiraImportForm } from "./opts"

export type { JiraImportForm } from "./opts"

export function JiraImportFormScope({
  requirements,
  configuration,
  onStart,
  onInvalid,
  children
}: Readonly<{
  requirements: JiraMigrationRequirements
  configuration: JiraMigrationConfiguration | null
  onStart: () => Promise<boolean>
  onInvalid: () => void
  children: (form: JiraImportForm) => ReactNode
}>) {
  const [opts] = useState(() => jiraImportFormOpts(requirements))
  const [defaultValues] = useState(() =>
    buildJiraImportDraft(requirements, configuration)
  )
  const form = useAppForm({
    ...opts,
    defaultValues,
    onSubmit: async () => {
      await onStart()
    },
    onSubmitInvalid: () => onInvalid()
  })
  return children(form)
}
