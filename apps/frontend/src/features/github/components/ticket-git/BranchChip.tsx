import { useAtomValue } from "@effect/atom-react"
import * as Result from "effect/reactivity/AsyncResult"

import { me } from "@/features/auth/atoms/auth"
import { branchOpensInNewTab, branchUrl } from "@/features/github/lib/branchUrl"

export function usePreferredBranchLink(slug: string, name: string) {
  const viewer = useAtomValue(me())
  const preference = Result.isSuccess(viewer)
    ? viewer.value.settings.editorPreference
    : "github"
  const href = branchUrl(preference, slug, name)
  return branchOpensInNewTab(preference)
    ? { href, target: "_blank", rel: "noreferrer" }
    : { href }
}
