import { useAtomSet, useAtomValue } from "@effect/atom-react"
import * as Exit from "effect/Exit"
import * as Result from "effect/reactivity/AsyncResult"
import { ExternalLink, GitBranch } from "lucide-react"

import { CommandFrame } from "@/features/command-menu/components/CommandFrame"
import type { CommandPageProps } from "@/features/command-menu/lib/commandPages"
import {
  githubIntegration,
  githubOrgRequest,
  startGithubAppManifest
} from "@/features/github/atoms/github"
import { useGithubInstall } from "@/features/github/hooks/useGithubInstall"
import { submitGithubAppManifest } from "@/features/github/lib/submitManifest"
import { mutationErrorText } from "@/lib/mutationError"
import { m } from "@/paraglide/messages"

export function GithubRegisterAppCommand(props: CommandPageProps) {
  return props.context.orgActor.call("projects", "startGithubAppManifest") ? (
    <RegisterApp {...props} />
  ) : null
}

function RegisterApp({ context, chip, onBack }: CommandPageProps) {
  const atom = startGithubAppManifest(githubOrgRequest(context.orgSlug))
  const start = useAtomSet(atom, { mode: "promiseExit" })
  const state = useAtomValue(atom)
  return (
    <CommandFrame
      chip={chip}
      placeholder={m.github_command_register_app()}
      description={m.github_apps_add_description()}
      onBack={onBack}
      notice={mutationErrorText(
        state,
        m.github_apps_add_error,
        m.github_apps_add_error
      )}
      items={[
        {
          value: "register",
          label: m.github_command_register_app(),
          icon: ExternalLink,
          disabled: state.waiting
        }
      ]}
      onSelect={() => {
        if (
          state.waiting ||
          !context.orgActor.call("projects", "startGithubAppManifest")
        )
          return
        void start({}).then((exit) => {
          if (Exit.isSuccess(exit)) submitGithubAppManifest(exit.value)
        })
      }}
    />
  )
}

export function GithubInstallAppCommand(props: CommandPageProps) {
  return props.context.orgActor.call("projects", "startGithubInstall") ? (
    <InstallApp {...props} />
  ) : null
}

function InstallApp({ context, chip, onBack, env }: CommandPageProps) {
  const status = useAtomValue(
    githubIntegration(githubOrgRequest(context.orgSlug))
  )
  const { install, waiting, error } = useGithubInstall(context.orgSlug)
  return Result.matchWithError(status, {
    onInitial: () => (
      <CommandFrame
        chip={chip}
        onBack={onBack}
        placeholder={m.chrome_loading()}
        items={[]}
        onSelect={() => undefined}
      />
    ),
    onError: () => (
      <CommandFrame
        chip={chip}
        onBack={onBack}
        placeholder={m.github_apps_install_button()}
        notice={m.github_chip_install_app_failed_error()}
        items={[]}
        onSelect={() => undefined}
      />
    ),
    onDefect: () => (
      <CommandFrame
        chip={chip}
        onBack={onBack}
        placeholder={m.github_apps_install_button()}
        notice={m.github_chip_install_app_failed_error()}
        items={[]}
        onSelect={() => undefined}
      />
    ),
    onSuccess: ({ value }) => (
      <CommandFrame
        chip={chip}
        onBack={onBack}
        placeholder={m.github_apps_install_choose_app()}
        description={m.github_command_install_description()}
        notice={error}
        items={value.apps.map((app) => ({
          value: app.id,
          label: app.name,
          icon: GitBranch,
          disabled: waiting
        }))}
        empty={{
          icon: GitBranch,
          title: m.github_apps_no_registrations(),
          description: m.github_apps_add_description(),
          action: context.orgActor.call("projects", "startGithubAppManifest")
            ? {
                label: m.github_command_register_app(),
                icon: ExternalLink,
                run: () => env.open("githubRegisterApp")
              }
            : undefined
        }}
        onSelect={(item) => {
          if (
            waiting ||
            !context.orgActor.call("projects", "startGithubInstall")
          )
            return
          void install({
            appId: item.value,
            returnProjectSlug: context.projectSlug
          })
        }}
      />
    )
  })
}
