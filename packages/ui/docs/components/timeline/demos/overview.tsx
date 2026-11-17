import { CircleDot, GitPullRequest, Zap } from "@pp/ui/icons"
import { MemberAvatar } from "@pp/ui/member-avatar"
import { SegmentedTabs } from "@pp/ui/segmented-tabs"
import {
  Timeline,
  TimelineEntry,
  TimelineEvent,
  TimelineRun,
  TimelineValue
} from "@pp/ui/timeline"
import { useState, type ReactNode } from "react"

import {
  ANA,
  Ago,
  BRAM,
  Bubble,
  CHIDI,
  Name,
  type Person
} from "./parts/timeline-parts"

type Order = "asc" | "desc"

const flip = (order: Order, rows: ReadonlyArray<ReactNode>) =>
  order === "asc" ? rows : rows.toReversed()

function Event({
  member,
  time,
  children
}: Readonly<{ member: Person; time: string; children: ReactNode }>) {
  return (
    <TimelineEvent
      mark={<MemberAvatar member={member} size={20} />}
      actor={<Name>{member.name}</Name>}
      time={<Ago>{time}</Ago>}
    >
      {children}
    </TimelineEvent>
  )
}

function Run({
  people,
  label,
  time,
  order,
  children
}: Readonly<{
  people: ReadonlyArray<Person>
  label: ReactNode
  time: string
  order: Order
  children: ReadonlyArray<ReactNode>
}>) {
  const [open, setOpen] = useState(false)
  return (
    <TimelineRun
      marks={people.map((member) => (
        <MemberAvatar key={member.id} member={member} size={20} />
      ))}
      label={label}
      time={<Ago>{time}</Ago>}
      open={open}
      onOpenChange={setOpen}
    >
      {flip(order, children)}
    </TimelineRun>
  )
}

// A ticket's activity: events on one rail, two folded runs that open right
// under themselves, and comments with replies one step in. Open a run, then
// flip the order.
export default function Overview() {
  const [order, setOrder] = useState<Order>("asc")
  const rows = [
    <Event key="created" member={ANA} time="5 days ago">
      created this
    </Event>,
    <Run
      key="run-1"
      order={order}
      people={[ANA, BRAM]}
      label={
        <>
          <Name>Ana Ruiz</Name> and 1 other made 4 changes
        </>
      }
      time="4 days ago"
    >
      {[
        <Event key="a" member={ANA} time="5 days ago">
          added this to{" "}
          <TimelineValue icon={<Zap strokeWidth={1.75} />}>
            Sprint 24
          </TimelineValue>
        </Event>,
        <Event key="b" member={BRAM} time="4 days ago">
          set priority <TimelineValue>High</TimelineValue>
        </Event>,
        <Event key="c" member={BRAM} time="4 days ago">
          assigned <TimelineValue>Chidi Okafor</TimelineValue>
        </Event>,
        <Event key="d" member={ANA} time="4 days ago">
          edited the description
        </Event>
      ]}
    </Run>,
    <TimelineEntry key="comment-1">
      <Bubble
        member={BRAM}
        time="3 days ago"
        replies={[
          <Bubble key="r1" member={CHIDI} time="3 days ago">
            Nice. Does that hold when two people move the same stop?
          </Bubble>,
          <Bubble key="r2" member={BRAM} time="2 days ago">
            Last write wins per stop; the other move shows as a conflict.
          </Bubble>
        ]}
      >
        I&apos;ve got the operation log working end to end on iOS. Reordering is
        the tricky one: a move is stored as &ldquo;put stop X after stop
        Y&rdquo;.
      </Bubble>
    </TimelineEntry>,
    <Event key="status" member={CHIDI} time="2 days ago">
      changed status{" "}
      <TimelineValue icon={<CircleDot className="text-state-info" />}>
        In progress
      </TimelineValue>
    </Event>,
    <TimelineEntry key="comment-2">
      <Bubble member={ANA} time="yesterday">
        Android is about two days behind. The SQLite migration for the
        operations table is in review.
      </Bubble>
    </TimelineEntry>,
    <Run
      key="run-2"
      order={order}
      people={[CHIDI, ANA]}
      label={
        <>
          <Name>Chidi Okafor</Name> and 1 other made 3 changes
        </>
      }
      time="2 hours ago"
    >
      {[
        <Event key="e" member={CHIDI} time="3 hours ago">
          opened{" "}
          <TimelineValue icon={<GitPullRequest className="text-state-info" />}>
            #412
          </TimelineValue>
        </Event>,
        <Event key="f" member={ANA} time="2 hours ago">
          requested changes
        </Event>,
        <Event key="g" member={CHIDI} time="2 hours ago">
          pushed 2 commits
        </Event>
      ]}
    </Run>,
    <Event key="renamed" member={ANA} time="10 minutes ago">
      renamed this
    </Event>
  ]
  return (
    <div className="grid w-full max-w-xl content-start gap-6">
      <div className="flex">
        <SegmentedTabs
          aria-label="Order"
          items={[
            { key: "asc", label: "Oldest first" },
            { key: "desc", label: "Newest first" }
          ]}
          value={order}
          onValueChange={setOrder}
        />
      </div>
      <Timeline>{flip(order, rows)}</Timeline>
    </div>
  )
}
