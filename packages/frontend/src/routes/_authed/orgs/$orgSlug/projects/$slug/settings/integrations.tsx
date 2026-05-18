import { useAtomSet } from "@effect-atom/atom-react"
import { createFileRoute } from "@tanstack/react-router"
import { projectKey, updateProjectSetupAtom } from "@/atoms/projects"
import { GithubChip } from "@/components/GithubChip"
import { Button } from "@/components/ui/button"
import { useProjectRole } from "@/lib/projectRole"
import { m } from "@/paraglide/messages"
import { useProject } from "../-context"

export const Route = createFileRoute(
  "/_authed/orgs/$orgSlug/projects/$slug/settings/integrations"
)({
  component: IntegrationsSettings,
  loader: () => ({
    crumb: {
      type: "static" as const,
      label: m.project_settings_integrations_tab()
    }
  })
})

function IntegrationsSettings() {
  const { orgSlug } = Route.useParams()
  const project = useProject()
  const update = useAtomSet(
    updateProjectSetupAtom(projectKey(orgSlug, project.slug))
  )
  const { role } = useProjectRole()

  return (
    <section className="flex w-full flex-col gap-4">
      <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-background px-4 py-3">
        <div>
          <p className="text-sm font-medium">
            {m.project_settings_github_heading()}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {project.github
              ? m.project_settings_github_connected()
              : m.project_settings_github_not_connected()}
          </p>
        </div>
        <GithubChip
          orgSlug={orgSlug}
          slug={project.slug}
          github={project.github}
          callerRole={role}
        />
      </div>
      {project.setup.connectGithubDismissedAt ? (
        <div className="flex items-center justify-between rounded-lg border border-border bg-background px-3 py-2">
          <span className="text-sm text-muted-foreground">
            {m.project_setup_github_dismissed_note()}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => update({ connectGithubDismissedAt: null })}
          >
            {m.project_setup_restore_button()}
          </Button>
        </div>
      ) : null}
    </section>
  )
}
