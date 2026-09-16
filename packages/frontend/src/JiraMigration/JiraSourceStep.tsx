import type {
  JiraConnection,
  JiraProjectChoice,
  JiraSite
} from "@projectproject/shared"
import { Check, Link2, ScanSearch } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger
} from "@/components/ui/select"
import { m } from "@/paraglide/messages"

export function JiraSourceStep({
  connection,
  sites,
  projects,
  selectedCloudId,
  selectedProjectId,
  onCloudIdChange,
  onProjectIdChange,
  sitesLoading = false,
  projectsLoading = false,
  migrationApiAvailable,
  oauthReturnPath = "/",
  scanWaiting = false,
  scanError = null,
  onScan
}: {
  connection: JiraConnection
  sites: ReadonlyArray<JiraSite>
  projects: ReadonlyArray<JiraProjectChoice>
  selectedCloudId: string
  selectedProjectId: string
  onCloudIdChange: (cloudId: string) => void
  onProjectIdChange: (projectId: string) => void
  sitesLoading?: boolean
  projectsLoading?: boolean
  migrationApiAvailable: boolean
  oauthReturnPath?: string
  scanWaiting?: boolean
  scanError?: string | null
  onScan?: () => void
}) {
  if (connection.status === "disconnected") {
    return (
      <StepSurface
        title={m.jira_migration_connect_title()}
        description={m.jira_migration_connect_description()}
      >
        <ul className="flex flex-col gap-3 py-2 text-sm text-foreground">
          {[
            m.jira_migration_connect_feature_snapshot(),
            m.jira_migration_connect_feature_control(),
            m.jira_migration_connect_feature_archive()
          ].map((feature) => (
            <li key={feature} className="flex items-start gap-3">
              <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
                <Check className="size-3.5" strokeWidth={1.75} />
              </span>
              <span className="leading-5">{feature}</span>
            </li>
          ))}
        </ul>
        <StepActions>
          <Button
            render={
              <a
                href={`/api/integrations/jira/oauth/start?returnPath=${encodeURIComponent(oauthReturnPath)}`}
              />
            }
            leadingIcon={Link2}
          >
            {m.jira_migration_action_connect()}
          </Button>
        </StepActions>
      </StepSurface>
    )
  }

  if (connection.status === "reconnect_required") {
    return (
      <StepSurface
        title={m.jira_migration_reconnect_title()}
        description={m.jira_migration_reconnect_description()}
      >
        <StepActions>
          <Button
            render={
              <a
                href={`/api/integrations/jira/oauth/start?returnPath=${encodeURIComponent(oauthReturnPath)}`}
              />
            }
            leadingIcon={Link2}
          >
            {m.jira_migration_action_connect()}
          </Button>
        </StepActions>
      </StepSurface>
    )
  }

  const selectedProject = projects.find(
    (project) => project.id === selectedProjectId
  )
  const canScan =
    migrationApiAvailable && Boolean(selectedCloudId && selectedProjectId)

  return (
    <StepSurface
      title={m.jira_migration_choose_title()}
      description={m.jira_migration_choose_description()}
    >
      <div className="flex flex-col gap-5">
        <label className="flex flex-col gap-2 text-[13px] font-medium">
          <span>{m.jira_migration_site_label()}</span>
          <Select
            value={selectedCloudId}
            onValueChange={(cloudId) => {
              onCloudIdChange(cloudId)
              onProjectIdChange("")
            }}
            disabled={sitesLoading || sites.length === 0}
          >
            <SelectTrigger
              aria-label={m.jira_migration_site_label()}
              placeholder={
                sitesLoading
                  ? m.jira_migration_site_loading()
                  : m.jira_migration_site_placeholder()
              }
              className="w-full"
            />
            <SelectContent>
              {sites.map((site, index) => (
                <SelectItem
                  key={site.cloudId}
                  value={site.cloudId}
                  index={index}
                >
                  {site.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!sitesLoading && sites.length === 0 ? (
            <span className="font-normal text-muted-foreground">
              {m.jira_migration_site_empty()}
            </span>
          ) : null}
        </label>

        <label className="flex flex-col gap-2 text-[13px] font-medium">
          <span>{m.jira_migration_project_label()}</span>
          <Select
            value={selectedProjectId}
            onValueChange={onProjectIdChange}
            disabled={
              !selectedCloudId || projectsLoading || projects.length === 0
            }
          >
            <SelectTrigger
              aria-label={m.jira_migration_project_label()}
              placeholder={
                projectsLoading
                  ? m.jira_migration_project_loading()
                  : m.jira_migration_project_placeholder()
              }
              className="w-full"
            />
            <SelectContent>
              {projects.map((project, index) => (
                <SelectItem key={project.id} value={project.id} index={index}>
                  {project.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!projectsLoading && selectedCloudId && projects.length === 0 ? (
            <span className="font-normal text-muted-foreground">
              {m.jira_migration_project_empty()}
            </span>
          ) : null}
        </label>

        <div className="flex items-center justify-between gap-4 border-t border-border pt-4 text-[13px]">
          <span className="text-muted-foreground">
            {m.jira_migration_project_type_label()}
          </span>
          <span>{selectedProject?.projectTypeKey ?? "—"}</span>
        </div>

        {!migrationApiAvailable ? (
          <p role="status" className="text-sm text-muted-foreground">
            {m.jira_migration_api_pending()}
          </p>
        ) : null}
        {scanError ? (
          <p role="alert" className="text-sm text-destructive">
            {scanError}
          </p>
        ) : null}
      </div>

      <StepActions>
        <Button
          disabled={!canScan || scanWaiting}
          loading={scanWaiting}
          leadingIcon={ScanSearch}
          onClick={onScan}
        >
          {m.jira_migration_action_scan()}
        </Button>
      </StepActions>
    </StepSurface>
  )
}

function StepSurface({
  title,
  description,
  children
}: {
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-[650px] flex-col">
      <div className="flex flex-1 flex-col gap-6 pb-8 pt-1">
        <div className="max-w-[65ch]">
          <h2 className="text-lg font-semibold tracking-tight text-foreground text-balance">
            {title}
          </h2>
          <p className="mt-1.5 text-sm leading-[21px] text-muted-foreground text-pretty">
            {description}
          </p>
        </div>
        {children}
      </div>
    </div>
  )
}

function StepActions({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-auto flex h-[72px] items-center justify-end border-t border-border px-4">
      {children}
    </div>
  )
}
