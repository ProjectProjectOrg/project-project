import { useAtomSet, useAtomValue } from "@effect/atom-react"
import type { StartGithubInstallInput } from "@pp/shared"
import * as Exit from "effect/Exit"
import * as Match from "effect/Match"

import {
  githubOrgRequest,
  startGithubInstall
} from "@/features/github/atoms/github"
import { mutationErrorText } from "@/lib/mutationError"
import { m } from "@/paraglide/messages"

export type GithubInstall = Readonly<{
  install: (input: StartGithubInstallInput) => Promise<void>
  waiting: boolean
  error: string | null
}>

export function useGithubInstall(orgSlug: string): GithubInstall {
  const req = githubOrgRequest(orgSlug)
  const start = useAtomSet(startGithubInstall(req), { mode: "promiseExit" })
  const state = useAtomValue(startGithubInstall(req))
  return {
    install: async (input) => {
      if (state.waiting) return
      const exit = await start(input)
      if (Exit.isSuccess(exit)) window.location.assign(exit.value.installUrl)
    },
    waiting: state.waiting,
    error: state.waiting
      ? null
      : mutationErrorText(
          state,
          (error) =>
            Match.value(error).pipe(
              Match.tag("Forbidden", () =>
                m.github_chip_install_app_forbidden_error()
              ),
              Match.orElse(() => m.github_chip_install_app_failed_error())
            ),
          m.github_chip_install_app_failed_error
        )
  }
}
