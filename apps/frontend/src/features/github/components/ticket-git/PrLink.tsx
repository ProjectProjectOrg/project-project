import { Badge } from "@pp/ui/badge"
import {
  Circle,
  GitMerge,
  GitPullRequest,
  GitPullRequestClosed,
  GitPullRequestDraft
} from "@pp/ui/icons"
import { cn } from "@pp/ui/lib/utils"

import { checksColor } from "@/features/github/lib/checksColor"

const pullRequestIcons = {
  open: GitPullRequest,
  draft: GitPullRequestDraft,
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
      : tone === "closed"
        ? "red"
        : tone === "draft"
          ? "muted"
          : "emerald"
  const Icon = pullRequestIcons[tone]
  return (
    <Badge
      render={({ children, ...props }) => (
        <a
          {...props}
          href={url}
          draggable={false}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
        >
          {children}
        </a>
      )}
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
    </Badge>
  )
}
