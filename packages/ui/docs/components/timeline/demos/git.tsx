import {
  GitBranch,
  GitMerge,
  GitPullRequest,
  GitPullRequestClosed,
  Layers
} from "@pp/ui/icons"
import { MemberAvatar } from "@pp/ui/member-avatar"
import {
  Timeline,
  TimelineChange,
  TimelineEvent,
  TimelineLiteral,
  TimelineValue
} from "@pp/ui/timeline"
import type { ReactNode } from "react"

import { StatusIcon } from "../../list-row/demos/parts/tickets"
import { Ago, ANA, Name, SystemMark } from "./parts/timeline-parts"

// A branch or pull request: its git icon (coloured by the pull request's
// state) and the literal, as the app's activity lines show them.
function Git({
  icon,
  children
}: Readonly<{ icon: ReactNode; children: string }>) {
  return (
    <TimelineValue icon={icon}>
      <TimelineLiteral>{children}</TimelineLiteral>
    </TimelineValue>
  )
}

function Status({
  status,
  children
}: Readonly<{ status: "progress" | "review" | "done"; children: string }>) {
  return (
    <TimelineValue icon={<StatusIcon status={status} />}>
      {children}
    </TimelineValue>
  )
}

// A system actor: GitHub (its branch glyph) or an automation (a bot).
function System({
  github = false,
  time,
  children
}: Readonly<{ github?: boolean; time: string; children: ReactNode }>) {
  return (
    <TimelineEvent
      mark={<SystemMark icon={github ? GitBranch : undefined} />}
      actor={<Name>{github ? "GitHub" : "Automation"}</Name>}
      time={<Ago>{time}</Ago>}
    >
      {children}
    </TimelineEvent>
  )
}

// A ticket's git story: a branch linked and one stacked on it, a pull
// request opened, closed and opened again, then merged, with the status
// following along by the project's git automation rules.
export default function GitActivity() {
  return (
    <Timeline className="w-full max-w-xl">
      <TimelineEvent
        mark={<MemberAvatar member={ANA} size={20} />}
        actor={<Name>{ANA.name}</Name>}
        time={<Ago>4 days ago</Ago>}
      >
        linked{" "}
        <Git icon={<GitBranch className="text-muted-foreground" />}>
          feat/ATL-235-conflicts
        </Git>
      </TimelineEvent>
      <TimelineEvent
        mark={<MemberAvatar member={ANA} size={20} />}
        actor={<Name>{ANA.name}</Name>}
        time={<Ago>4 days ago</Ago>}
      >
        stacked{" "}
        <Git icon={<Layers className="text-muted-foreground" />}>
          feat/ATL-236-revisions
        </Git>
      </TimelineEvent>
      <System github time="3 days ago">
        opened{" "}
        <Git icon={<GitPullRequest className="text-state-info" />}>#138</Git>
      </System>
      <System github time="3 days ago">
        closed{" "}
        <Git icon={<GitPullRequestClosed className="text-muted-foreground" />}>
          #138
        </Git>
      </System>
      <System github time="2 days ago">
        opened{" "}
        <Git icon={<GitPullRequest className="text-state-info" />}>#141</Git>
      </System>
      <System time="2 days ago">
        status{" "}
        <TimelineChange
          from={<Status status="progress">In progress</Status>}
          to={<Status status="review">In review</Status>}
          toLabel="to"
        />{" "}
        by a git automation rule
      </System>
      <System github time="1 hour ago">
        merged <Git icon={<GitMerge className="text-state-merged" />}>#141</Git>
      </System>
      <System time="1 hour ago">
        status{" "}
        <TimelineChange
          from={<Status status="review">In review</Status>}
          to={<Status status="done">Done</Status>}
          toLabel="to"
        />{" "}
        by a git automation rule
      </System>
    </Timeline>
  )
}
