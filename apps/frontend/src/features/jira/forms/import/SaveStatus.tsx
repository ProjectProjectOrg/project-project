import { Button } from "@/components/ui/button"
import type { JiraImportDraftSave } from "@/features/jira/hooks/useJiraImportDraft"
import { jiraConnectHref } from "@/features/jira/lib/connect"
import { m } from "@/paraglide/messages"

export function SaveStatus({
  draft,
  onReload,
  returnPath
}: Readonly<{
  draft: JiraImportDraftSave
  onReload: () => void
  returnPath: string
}>) {
  if (draft.failure !== null)
    return (
      <span className="flex min-w-0 items-center gap-2">
        <span
          role="alert"
          title={draft.failure.message}
          className="truncate text-[13px] text-destructive"
        >
          {draft.failure.message}
        </span>
        {draft.failure.remedy === "reload" ? (
          <Button variant="tertiary" size="sm" onClick={onReload}>
            {m.jira_import_action_reload()}
          </Button>
        ) : null}
        {draft.failure.remedy === "reconnect" ? (
          <Button
            variant="tertiary"
            size="sm"
            render={
              <a
                href={jiraConnectHref(returnPath)}
                aria-label={m.jira_import_action_connect()}
              />
            }
          >
            {m.jira_import_action_connect()}
          </Button>
        ) : null}
      </span>
    )
  return (
    <output className="truncate text-[13px] text-muted-foreground">
      {draft.saving ? m.jira_import_saving() : m.jira_import_saved()}
    </output>
  )
}
