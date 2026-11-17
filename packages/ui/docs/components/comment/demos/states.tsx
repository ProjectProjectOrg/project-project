import { Button } from "@pp/ui/button"
import {
  Comment,
  CommentComposer,
  CommentEarlier,
  CommentReplies,
  CommentReplyBox,
  CommentThread
} from "@pp/ui/comment"
import { LexicalEditor } from "@pp/ui/editor/lexical-editor"
import { CircleCheck, X } from "@pp/ui/icons"
import { AvatarStack, MemberAvatar } from "@pp/ui/member-avatar"
import { Timeline, TimelineEntry } from "@pp/ui/timeline"
import { useState, type ReactNode } from "react"

import { EditorKit } from "../../../editor/kit"
import {
  ANA,
  Ago,
  BRAM,
  CHIDI
} from "../../timeline/demos/parts/timeline-parts"
import { Unsent } from "./parts/comment-parts"

function Case({
  caption,
  children
}: Readonly<{ caption: string; children: ReactNode }>) {
  return (
    <div className="grid min-w-0 content-start gap-2">
      <span className="text-caption text-muted-foreground">{caption}</span>
      <Timeline>
        <TimelineEntry>{children}</TimelineEntry>
      </Timeline>
    </div>
  )
}

function Resolved() {
  const [open, setOpen] = useState(false)
  return (
    <CommentThread>
      <Comment
        mark={<MemberAvatar member={ANA} size={20} />}
        author="Ana Ruiz"
        time={<Ago>2 days ago</Ago>}
      >
        <p>Should the conflict banner block saving?</p>
      </Comment>
      <CommentReplies>
        <CommentEarlier
          label={
            open ? (
              "Collapse"
            ) : (
              <>
                <AvatarStack subjects={[BRAM, CHIDI]} size={16} />2 replies from
                Bram de Vries and Chidi Okafor
              </>
            )
          }
          open={open}
          onOpenChange={setOpen}
        >
          <Comment
            mark={<MemberAvatar member={BRAM} size={20} />}
            author="Bram de Vries"
            time={<Ago>2 days ago</Ago>}
          >
            <p>No, it should only warn.</p>
          </Comment>
          <Comment
            mark={<MemberAvatar member={CHIDI} size={20} />}
            author="Chidi Okafor"
            time={<Ago>yesterday</Ago>}
            meta={
              <span className="inline-flex items-center gap-1 text-state-success">
                <CircleCheck className="size-3.5" strokeWidth={2} />
                Resolved
              </span>
            }
          >
            <p>Agreed, warning only.</p>
          </Comment>
        </CommentEarlier>
      </CommentReplies>
    </CommentThread>
  )
}

// Every state on its own: sending, linked to, edited and imported, being
// edited, an action that failed, a comment that failed to send, and a
// resolved thread folded to who replied.
export default function States() {
  return (
    <EditorKit>
      <div className="@container grid w-full gap-8 @2xl:grid-cols-[repeat(2,minmax(0,1fr))]">
        <Case caption="Sending: pulses until it's saved">
          <Comment
            mark={<MemberAvatar member={ANA} size={20} />}
            author="Ana Ruiz"
            time={<Ago>just now</Ago>}
            pending
          >
            <p>On it.</p>
          </Comment>
        </Case>
        <Case caption="Linked to: a link to this comment rings it">
          <Comment
            mark={<MemberAvatar member={BRAM} size={20} />}
            author="Bram de Vries"
            time={<Ago>1 hour ago</Ago>}
            targeted
          >
            <p>Here&apos;s the crash log from the Pixel 6.</p>
          </Comment>
        </Case>
        <Case caption="Edited, imported from Jira">
          <Comment
            mark={
              <MemberAvatar
                member={{ id: "imported:Jo", name: "Jo Park" }}
                size={20}
              />
            }
            author="Jo Park"
            time={<Ago>last month</Ago>}
            meta={
              <>
                <span>edited</span>
                <span>imported from Jira</span>
              </>
            }
          >
            <p>Original estimate was 3 days.</p>
          </Comment>
        </Case>
        <Case caption="Being edited: Cancel and Save inside the bubble">
          <Comment
            mark={<MemberAvatar member={CHIDI} size={20} />}
            author="Chidi Okafor"
            meta={<span>editing…</span>}
            editActions={
              <>
                <Button variant="ghost" size="sm">
                  <X className="size-4" strokeWidth={1.75} />
                  Cancel
                </Button>
                <Button size="sm">Save</Button>
              </>
            }
          >
            <LexicalEditor compact markdown="The migration is in review." />
          </Comment>
        </Case>
        <Case caption="An action failed: the error under the bubble">
          <Comment
            mark={<MemberAvatar member={ANA} size={20} />}
            author="Ana Ruiz"
            time={<Ago>just now</Ago>}
            footer={
              <p role="alert" className="mt-1 pl-3 text-body text-destructive">
                Couldn&apos;t delete the comment. Try again.
              </p>
            }
          >
            <p>Draft notes for the review.</p>
          </Comment>
        </Case>
        <Case caption="Resolved, folded to who replied">
          <Resolved />
        </Case>
        <Case caption="Replying: the box open under the thread">
          <CommentThread>
            <Comment
              mark={<MemberAvatar member={BRAM} size={20} />}
              author="Bram de Vries"
              time={<Ago>1 hour ago</Ago>}
            >
              <p>Can someone check the Pixel 6 build?</p>
            </Comment>
            <CommentReplies>
              <CommentReplyBox
                mark={<MemberAvatar member={ANA} size={20} />}
                author="Ana Ruiz"
                time={<Ago>just now</Ago>}
                submit={
                  <Button size="sm" disabled>
                    Reply
                  </Button>
                }
              >
                <LexicalEditor
                  compact
                  markdown=""
                  placeholder="Leave a reply…"
                />
              </CommentReplyBox>
            </CommentReplies>
          </CommentThread>
        </Case>
        <Case caption="A reply sending: pulses until it's saved">
          <CommentThread>
            <Comment
              mark={<MemberAvatar member={BRAM} size={20} />}
              author="Bram de Vries"
              time={<Ago>1 hour ago</Ago>}
            >
              <p>Can someone check the Pixel 6 build?</p>
            </Comment>
            <CommentReplies>
              <Comment
                mark={<MemberAvatar member={ANA} size={20} />}
                author="Ana Ruiz"
                time={<Ago>just now</Ago>}
                pending
              >
                <p>On it, give me ten minutes.</p>
              </Comment>
            </CommentReplies>
          </CommentThread>
        </Case>
        <Case caption="A reply that failed: kept in its place, with Retry">
          <CommentThread>
            <Comment
              mark={<MemberAvatar member={BRAM} size={20} />}
              author="Bram de Vries"
              time={<Ago>1 hour ago</Ago>}
            >
              <p>Can someone check the Pixel 6 build?</p>
            </Comment>
            <CommentReplies>
              <Unsent member={ANA} onRetry={() => undefined}>
                On it, give me ten minutes.
              </Unsent>
            </CommentReplies>
          </CommentThread>
        </Case>
        <Case caption="Writing a new comment">
          <CommentComposer submit={<Button size="sm">Comment</Button>}>
            <LexicalEditor compact markdown="The migration is merged." />
          </CommentComposer>
        </Case>
        <Case caption="A comment that failed to send: Retry, or Edit, Copy text and Discard in its menu">
          <Unsent member={CHIDI} onRetry={() => undefined}>
            The migration is merged.
          </Unsent>
        </Case>
      </div>
    </EditorKit>
  )
}
