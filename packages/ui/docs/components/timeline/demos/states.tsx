import { MemberAvatar } from "@pp/ui/member-avatar"
import {
  Timeline,
  TimelineActor,
  TimelineEvent,
  TimelineQuote,
  TimelineRun,
  TimelineSkeleton
} from "@pp/ui/timeline"
import { useState, type ReactNode } from "react"

import { ANA, Ago, BRAM, Name, SystemMark } from "./parts/timeline-parts"

function Case({
  caption,
  children
}: Readonly<{ caption: string; children: ReactNode }>) {
  return (
    <div className="grid min-w-0 content-start gap-2">
      <span className="text-caption text-muted-foreground">{caption}</span>
      {children}
    </div>
  )
}

function Run({ initial }: Readonly<{ initial: boolean }>) {
  const [open, setOpen] = useState(initial)
  return (
    <Timeline>
      <TimelineRun
        marks={[
          <MemberAvatar key="ana" member={ANA} size={20} />,
          <MemberAvatar key="bram" member={BRAM} size={20} />
        ]}
        label={
          <>
            <Name>Ana Ruiz</Name> and 1 other made 2 changes
          </>
        }
        time={<Ago>2 hours ago</Ago>}
        open={open}
        onOpenChange={setOpen}
      >
        <TimelineEvent
          mark={<MemberAvatar member={ANA} size={20} />}
          actor={<Name>Ana Ruiz</Name>}
          time={<Ago>3 hours ago</Ago>}
        >
          set priority High
        </TimelineEvent>
        <TimelineEvent
          mark={<MemberAvatar member={BRAM} size={20} />}
          actor={<Name>Bram de Vries</Name>}
          time={<Ago>2 hours ago</Ago>}
        >
          assigned Ana Ruiz
        </TimelineEvent>
      </TimelineRun>
    </Timeline>
  )
}

// Every state on its own: a lone event, a system actor, an agent acting for
// a person, a quoted edit, a run closed and open, and loading.
export default function States() {
  return (
    <div className="@container grid w-full gap-8 @2xl:grid-cols-[repeat(2,minmax(0,1fr))]">
      <Case caption="A lone event: no rail">
        <Timeline>
          <TimelineEvent
            mark={<MemberAvatar member={ANA} size={20} />}
            actor={<Name>Ana Ruiz</Name>}
            time={<Ago>just now</Ago>}
          >
            created this
          </TimelineEvent>
        </Timeline>
      </Case>
      <Case caption="A system actor and an agent">
        <Timeline>
          <TimelineEvent
            mark={<SystemMark />}
            actor={<Name>GitHub</Name>}
            time={<Ago>1 hour ago</Ago>}
          >
            linked a branch
          </TimelineEvent>
          <TimelineEvent
            mark={<MemberAvatar member={BRAM} size={20} />}
            actor={
              <TimelineActor via="via Claude Code">Bram de Vries</TimelineActor>
            }
            time={<Ago>5 minutes ago</Ago>}
          >
            edited the description
          </TimelineEvent>
        </Timeline>
      </Case>
      <Case caption="A quote under the line">
        <Timeline>
          <TimelineEvent
            mark={<MemberAvatar member={ANA} size={20} />}
            actor={<Name>Ana Ruiz</Name>}
            time={<Ago>yesterday</Ago>}
          >
            deleted a comment
            <TimelineQuote>Android is about two days behind.</TimelineQuote>
          </TimelineEvent>
        </Timeline>
      </Case>
      <Case caption="A run, closed">
        <Run initial={false} />
      </Case>
      <Case caption="A run, open">
        <Run initial />
      </Case>
      <Case caption="Loading">
        <TimelineSkeleton label="Loading activity" />
      </Case>
    </div>
  )
}
