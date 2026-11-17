import {
  CommentEarlier,
  CommentReplies,
  CommentReplyAction,
  CommentReplySwap,
  CommentThread
} from "@pp/ui/comment"
import { MemberAvatar } from "@pp/ui/member-avatar"
import { Timeline, TimelineEntry, TimelineEvent } from "@pp/ui/timeline"
import { useState } from "react"

import { EditorKit } from "../../../editor/kit"
import {
  ANA,
  Ago,
  BRAM,
  CHIDI,
  Name
} from "../../timeline/demos/parts/timeline-parts"
import { ReplyBox, Said } from "./parts/comment-parts"

// A ticket's threads on its timeline: one with replies (one step in, two
// earlier ones folded) and one without. Reply under the last bubble opens
// the reply box in its place; on the comment without replies it starts the
// indent, and the rail's bend eases out with it. The editor is app-only; a textarea
// stands in.
export default function Overview() {
  const [open, setOpen] = useState(false)
  const [replying, setReplying] = useState(false)
  const [answering, setAnswering] = useState(false)
  return (
    <EditorKit>
      <div className="w-full max-w-xl">
        <Timeline>
          <TimelineEvent
            mark={<MemberAvatar member={ANA} size={20} />}
            actor={<Name>Ana Ruiz</Name>}
            time={<Ago>4 days ago</Ago>}
          >
            created this
          </TimelineEvent>
          <TimelineEntry>
            <CommentThread>
              <Said member={BRAM} time="3 days ago" thread>
                I&apos;ve got the operation log working end to end on iOS.
                Reordering is the tricky one: a move is stored as &ldquo;put
                stop X after stop Y&rdquo;.
              </Said>
              <CommentReplies>
                <CommentEarlier
                  label={open ? "Collapse" : "Show 2 earlier replies"}
                  open={open}
                  onOpenChange={setOpen}
                >
                  <Said member={CHIDI} time="3 days ago">
                    Nice. Does that hold when two people move the same stop?
                  </Said>
                  <Said member={BRAM} time="3 days ago">
                    Last write wins per stop; the other move shows as a
                    conflict.
                  </Said>
                </CommentEarlier>
                <Said member={ANA} time="2 days ago">
                  Good enough for the beta. Let&apos;s ship it behind the flag.
                </Said>
                <CommentReplySwap
                  open={replying}
                  under="reply"
                  action={
                    <CommentReplyAction onClick={() => setReplying(true)}>
                      Reply
                    </CommentReplyAction>
                  }
                >
                  <ReplyBox member={CHIDI} onClose={() => setReplying(false)} />
                </CommentReplySwap>
              </CommentReplies>
            </CommentThread>
          </TimelineEntry>
          <TimelineEntry>
            <CommentThread>
              <Said member={ANA} time="yesterday">
                Android is about two days behind. The SQLite migration is in
                review.
              </Said>
              <CommentReplies>
                <CommentReplySwap
                  open={answering}
                  under="comment"
                  action={
                    <CommentReplyAction
                      under="comment"
                      onClick={() => setAnswering(true)}
                    >
                      Reply
                    </CommentReplyAction>
                  }
                >
                  <ReplyBox
                    member={CHIDI}
                    onClose={() => setAnswering(false)}
                  />
                </CommentReplySwap>
              </CommentReplies>
            </CommentThread>
          </TimelineEntry>
          <TimelineEvent
            mark={<MemberAvatar member={CHIDI} size={20} />}
            actor={<Name>Chidi Okafor</Name>}
            time={<Ago>yesterday</Ago>}
          >
            changed status to In progress
          </TimelineEvent>
        </Timeline>
      </div>
    </EditorKit>
  )
}
