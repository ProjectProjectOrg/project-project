import { useAtomSet, useAtomValue } from "@effect/atom-react"
import * as Exit from "effect/Exit"
import * as Match from "effect/Match"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import { ExternalLink } from "lucide-react"

import {
  SettingsGroup,
  SettingsRow,
  SettingsSection
} from "@/components/shell/settings/SettingsSection"
import { Button } from "@/components/ui/button"
import {
  chooseGithubInstallation,
  githubInstallationChoices,
  githubInstallationChoicesRequest,
  githubOrgRequest
} from "@/features/github/atoms/github"
import { mutationErrorText } from "@/lib/mutationError"
import { m } from "@/paraglide/messages"

export function InstallationChoices({
  orgSlug,
  state
}: Readonly<{ orgSlug: string; state: string }>) {
  const choices = useAtomValue(
    githubInstallationChoices(githubInstallationChoicesRequest(orgSlug, state))
  )
  const orgReq = githubOrgRequest(orgSlug)
  const choose = useAtomSet(chooseGithubInstallation(orgReq), {
    mode: "promiseExit"
  })
  const chooseState = useAtomValue(chooseGithubInstallation(orgReq))
  const choosing = chooseState.waiting
  const chooseError = choosing
    ? null
    : mutationErrorText(
        chooseState,
        (error) =>
          Match.value(error).pipe(
            Match.tag("Conflict", () =>
              m.org_integrations_github_choice_conflict_error()
            ),
            Match.tag("NotFound", () =>
              m.org_integrations_github_choice_expired()
            ),
            Match.tag("Forbidden", () =>
              m.github_chip_install_app_forbidden_error()
            ),
            Match.orElse(() => m.github_chip_install_app_failed_error())
          ),
        m.github_chip_install_app_failed_error
      )

  async function pick(installationId: string | null) {
    if (choosing) return
    const exit = await choose({ state, installationId })
    if (Exit.isSuccess(exit)) window.location.assign(exit.value.redirectUrl)
  }

  return AsyncResult.matchWithError(choices, {
    onInitial: () => null,
    onError: () => (
      <ChoiceNote>{m.org_integrations_github_choice_expired()}</ChoiceNote>
    ),
    onDefect: () => (
      <ChoiceNote>{m.github_chip_install_app_failed_error()}</ChoiceNote>
    ),
    onSuccess: ({ value }) => (
      <SettingsSection
        title={m.org_integrations_github_choice_heading()}
        description={m.org_integrations_github_choice_description()}
      >
        <SettingsGroup>
          {value.installations.map((installation) => (
            <SettingsRow
              key={installation.installationId}
              label={installation.accountLogin}
              description={
                installation.connectedElsewhere
                  ? m.org_integrations_github_choice_connected_elsewhere()
                  : installation.accountType === "Organization"
                    ? m.org_integrations_github_account_type_org()
                    : m.org_integrations_github_account_type_user()
              }
            >
              <Button
                type="button"
                size="sm"
                disabled={installation.connectedElsewhere || choosing}
                onClick={() => void pick(installation.installationId)}
              >
                {m.org_integrations_github_choice_connect_button()}
              </Button>
            </SettingsRow>
          ))}
          <SettingsRow
            label={m.org_integrations_github_choice_other_label()}
            description={m.org_integrations_github_choice_other_description()}
          >
            <Button
              type="button"
              variant="tertiary"
              size="sm"
              trailingIcon={ExternalLink}
              disabled={choosing}
              onClick={() => void pick(null)}
            >
              {m.org_integrations_install_button()}
            </Button>
          </SettingsRow>
        </SettingsGroup>
        {chooseError ? (
          <p role="alert" className="text-xs text-destructive">
            {chooseError}
          </p>
        ) : null}
      </SettingsSection>
    )
  })
}

function ChoiceNote({ children }: Readonly<{ children: string }>) {
  return (
    <p role="alert" className="text-xs text-destructive">
      {children}
    </p>
  )
}
