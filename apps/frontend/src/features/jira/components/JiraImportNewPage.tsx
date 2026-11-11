import { useAtomRefresh, useAtomValue } from "@effect/atom-react"

import { AsyncView, type AsyncFailure } from "@/components/shell/AsyncView"
import { ReadFailure } from "@/components/shell/ReadFailure"
import { Button } from "@/components/ui/button"
import { jiraProfile, jiraSites } from "@/features/jira/atoms/jiraMigration"
import { JiraSourceForm } from "@/features/jira/forms/jira-source"
import { jiraConnectHref } from "@/features/jira/lib/connect"
import { m } from "@/paraglide/messages"

import { ImportPoints } from "./ImportPoints"
import { JiraImportShell } from "./JiraImportShell"
import { StepFrame } from "./StepFrame"
import { StepSkeleton } from "./StepSkeleton"

export function JiraImportNewPage({ orgSlug }: Readonly<{ orgSlug: string }>) {
  const profile = useAtomValue(jiraProfile)
  const refreshProfile = useAtomRefresh(jiraProfile)
  return (
    <JiraImportShell
      orgSlug={orgSlug}
      title={m.jira_import_title_new()}
      stage="source"
      screenKey="source"
    >
      <AsyncView
        result={profile}
        onInitial={() => <StepSkeleton />}
        onFailure={(failure) => (
          <SourceFailure failure={failure} onRetry={refreshProfile} />
        )}
        onSuccess={({ value }) =>
          value.status === "connected" ? (
            <SourcePicker orgSlug={orgSlug} />
          ) : (
            <ConnectJira
              orgSlug={orgSlug}
              reconnect={value.status === "reconnect_required"}
            />
          )
        }
      />
    </JiraImportShell>
  )
}

function ConnectJira({
  orgSlug,
  reconnect
}: Readonly<{ orgSlug: string; reconnect: boolean }>) {
  return (
    <StepFrame
      title={
        reconnect
          ? m.jira_import_reconnect_title()
          : m.jira_import_connect_title()
      }
      description={
        reconnect
          ? m.jira_import_reconnect_description()
          : m.jira_import_connect_description()
      }
      end={
        <Button
          render={
            <a
              href={jiraConnectHref(`/orgs/${orgSlug}/migrations/jira/new`)}
              aria-label={m.jira_import_action_connect()}
            />
          }
        >
          {m.jira_import_action_connect()}
        </Button>
      }
    >
      <ImportPoints />
    </StepFrame>
  )
}

function SourcePicker({ orgSlug }: Readonly<{ orgSlug: string }>) {
  const sites = useAtomValue(jiraSites)
  const refreshSites = useAtomRefresh(jiraSites)
  return (
    <AsyncView
      result={sites}
      onInitial={() => <StepSkeleton />}
      onFailure={(failure) => (
        <SourceFailure failure={failure} onRetry={refreshSites} />
      )}
      onSuccess={({ value }) => (
        <JiraSourceForm orgSlug={orgSlug} sites={value} />
      )}
    />
  )
}

function SourceFailure<E>({
  failure,
  onRetry
}: Readonly<{ failure: AsyncFailure<E>; onRetry: () => void }>) {
  return (
    <StepFrame
      title={m.jira_import_source_title()}
      description={m.jira_import_source_description()}
    >
      <ReadFailure failure={failure} onRetry={onRetry} />
    </StepFrame>
  )
}
