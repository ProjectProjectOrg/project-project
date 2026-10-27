import {
  Circle,
  GitMerge,
  GitPullRequest,
  GitPullRequestClosed
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { checksColor } from "@/features/github/lib/checksColor"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

const pullRequestIcons = {
  open: GitPullRequest,
  draft: GitPullRequest,
  merged: GitMerge,
  closed: GitPullRequestClosed
}

export function PrLink({
  number,
  url,
  tone,
  checks
}: {
  number: number
  url: string
  tone: "open" | "draft" | "merged" | "closed"
  checks?: string
}) {
  const badgeTone =
    tone === "merged"
      ? "violet"
      : tone === "closed" || tone === "draft"
        ? "muted"
        : "emerald"
  const Icon = pullRequestIcons[tone]
  return (
    <Badge
      render={
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
        />
      }
      tone={badgeTone}
      size="xs"
    >
      <Icon strokeWidth={1.75} />#{number}
      {checks && checks !== "none" && (
        <Circle
          className={cn("size-2 fill-current", checksColor(checks))}
          strokeWidth={0}
        />
      )}
      {tone === "draft" && <span>{m.git_pr_draft_label()}</span>}
    </Badge>
  )
}
