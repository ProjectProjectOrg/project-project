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
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

export function AddGithubApp({ orgSlug }: Readonly<{ orgSlug: string }>) {
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

  return (
    <SettingsGroup>
      <SettingsRow
        label={m.github_apps_add_label()}
        description={m.github_apps_add_description()}
        error={error}
      >
        <Button
          type="button"
          size="sm"
          trailingIcon={ExternalLink}
          onClick={() => void submit()}
          className={cn(state.waiting && "animate-pulse")}
        >
          {m.github_apps_add_submit()}
        </Button>
      </SettingsRow>
    </SettingsGroup>
  )
}
