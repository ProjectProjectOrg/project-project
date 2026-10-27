import { useAtomValue } from "@effect/atom-react"
import * as Result from "effect/reactivity/AsyncResult"
import { ArrowUpRight, GitBranch } from "lucide-react"

import { CopyButton } from "@/components/ui/copy-button"
import { me } from "@/features/auth/atoms/auth"
import { branchOpensInNewTab, branchUrl } from "@/features/github/lib/branchUrl"
import { m } from "@/paraglide/messages"

function usePreferredBranchLink(
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
  displayName,
  variant = "muted"
}: {
  slug: string
  name: string
  displayName?: string
  variant?: "muted" | "ghost"
}) {
  const link = usePreferredBranchLink(slug, name)
  if (variant === "ghost") {
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
  return (
    <span
      className="inline-flex max-w-full min-w-0 items-center gap-1.5 rounded-md bg-muted pr-1 font-mono text-xs text-muted-foreground transition-colors duration-100 hover:text-foreground"
      title={name}
    >
      <a
        {...link}
        onClick={(e) => e.stopPropagation()}
        className="inline-flex min-w-0 items-center gap-1 rounded-md py-0.5 pl-1.5 transition-colors duration-100 hover:text-foreground"
      >
        <GitBranch className="size-3 shrink-0" strokeWidth={1.75} />
        <span className="min-w-0 truncate">{displayName ?? name}</span>
        <ArrowUpRight className="size-3 shrink-0" strokeWidth={1.75} />
      </a>
      <CopyButton value={name} copyLabel={m.git_copy_branch_name_label()} />
    </span>
  )
}
