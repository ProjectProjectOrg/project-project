import { Badge, type BadgeTone } from "@pp/ui/badge"
import {
  GitMerge,
  GitPullRequest,
  GitPullRequestClosed,
  GitPullRequestDraft
} from "lucide-react"

const PULL_REQUESTS = [
  { number: 482, state: "open", tone: "emerald", icon: GitPullRequest },
  { number: 471, state: "merged", tone: "violet", icon: GitMerge },
  { number: 466, state: "draft", tone: "muted", icon: GitPullRequestDraft },
  { number: 460, state: "closed", tone: "muted", icon: GitPullRequestClosed }
] as const satisfies ReadonlyArray<{
  number: number
  state: string
  tone: BadgeTone
  icon: unknown
}>

export default function PullRequestLinks() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {PULL_REQUESTS.map(({ number, state, tone, icon: Icon }) => (
        <Badge
          key={number}
          tone={tone}
          size="xs"
          render={
            <a
              href={`#pull-${number}`}
              aria-label={`Pull request ${number}, ${state}`}
            />
          }
        >
          <Icon strokeWidth={1.75} />#{number}
        </Badge>
      ))}
    </div>
  )
}
