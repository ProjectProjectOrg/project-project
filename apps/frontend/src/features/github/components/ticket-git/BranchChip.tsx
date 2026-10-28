import { useAtomValue } from "@effect/atom-react"
import * as Result from "effect/reactivity/AsyncResult"
import { ArrowUpRight, GitBranch } from "lucide-react"

import { me } from "@/features/auth/atoms/auth"
import { branchOpensInNewTab, branchUrl } from "@/features/github/lib/branchUrl"

export function usePreferredBranchLink(
  slug: string,
  name: string
): { href: string; target?: "_blank"; rel?: "noreferrer" } {
  const viewer = useAtomValue(me())
  const preference = Result.isSuccess(viewer)
    ? viewer.value.editorPreference
    : "github"
  const href = branchUrl(preference, slug, name)
  return branchOpensInNewTab(preference)
    ? { href, target: "_blank", rel: "noreferrer" }
    : { href }
}

export function BranchChip({
  slug,
  name,
  displayName
}: Readonly<{
  slug: string
  name: string
  displayName?: string
}>) {
  const link = usePreferredBranchLink(slug, name)
  return (
    <a
      {...link}
      onClick={(e) => e.stopPropagation()}
      title={name}
      className="inline-flex max-w-full min-w-0 items-center gap-1 rounded-md px-1.5 py-0.5 font-mono text-xs text-muted-foreground transition-colors duration-100 hover:bg-hover hover:text-foreground"
    >
      <GitBranch className="size-3 shrink-0" strokeWidth={1.75} />
      <span className="min-w-0 truncate">{displayName ?? name}</span>
      <ArrowUpRight className="size-3 shrink-0" strokeWidth={1.75} />
    </a>
  )
}
