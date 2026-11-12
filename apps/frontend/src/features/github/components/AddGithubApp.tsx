import { useAtomSet, useAtomValue } from "@effect/atom-react"
import * as Exit from "effect/Exit"
import { ExternalLink } from "lucide-react"

import {
  SettingsGroup,
  SettingsRow
} from "@/components/shell/settings/SettingsSection"
import { Button } from "@/components/ui/button"
import {
  githubOrgRequest,
  startGithubAppManifest
} from "@/features/github/atoms/github"
import { submitGithubAppManifest } from "@/features/github/lib/submitManifest"
import { mutationErrorText } from "@/lib/mutationError"
import { m } from "@/paraglide/messages"

export function AddGithubApp({
  orgSlug,
  variant = "default"
}: Readonly<{ orgSlug: string; variant?: "default" | "header" }>) {
  const atom = startGithubAppManifest(githubOrgRequest(orgSlug))
  const start = useAtomSet(atom, { mode: "promiseExit" })
  const state = useAtomValue(atom)
  const error = state.waiting
    ? null
    : mutationErrorText(state, m.github_apps_add_error, m.github_apps_add_error)

  async function submit() {
    if (state.waiting) return
    const exit = await start({})
    if (Exit.isSuccess(exit)) submitGithubAppManifest(exit.value)
  }

  const button = (
    <Button
      type="button"
      variant={variant === "header" ? "tertiary" : "primary"}
      size="sm"
      trailingIcon={ExternalLink}
      onClick={() => void submit()}
      disabled={state.waiting}
    >
      {variant === "header"
        ? m.github_apps_add_another()
        : m.github_apps_add_submit()}
    </Button>
  )

  if (variant === "header") {
    return (
      <div className="flex flex-col items-end gap-1">
        {button}
        {error ? (
          <p role="alert" className="text-caption text-destructive">
            {error}
          </p>
        ) : null}
      </div>
    )
  }

  return (
    <SettingsGroup>
      <SettingsRow
        label={m.github_apps_add_label()}
        description={m.github_apps_add_description()}
        error={error}
      >
        {button}
      </SettingsRow>
    </SettingsGroup>
  )
}
