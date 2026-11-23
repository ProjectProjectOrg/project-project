import { Button } from "@pp/ui/button"
import { CommentComposer, CommentThread } from "@pp/ui/comment"
import { LexicalEditor } from "@pp/ui/editor/lexical-editor"
import { MemberAvatar } from "@pp/ui/member-avatar"
import { Switch } from "@pp/ui/switch"
import { Timeline, TimelineEntry, TimelineEvent } from "@pp/ui/timeline"
import { useRef, useState } from "react"

import { EditorKit } from "../../../editor/kit"
import {
  ANA,
  Ago,
  BRAM,
  CHIDI,
  Name
} from "../../timeline/demos/parts/timeline-parts"
import { Said, Unsent } from "./parts/comment-parts"

type Placed = Readonly<{
  id: number
  text: string
  state: "sending" | "sent" | "failed"
}>

// Placing a comment, as the ticket page does: write it in the composer
// under the timeline (our editor: / opens its menu) and press Comment or
// ⌘↵; Enter is a new line. It joins the timeline at
// once while it's sent, easing in instead of popping in, pulses until it's
// saved, and the rail follows it down. Switch on "Fail to send" and it
// stays put, ringed in red, with Retry under it and Edit, Copy text and
// Discard in its menu; the composer is clear for the next one.
export default function Placing() {
  const [text, setText] = useState("")
  const [placed, setPlaced] = useState<ReadonlyArray<Placed>>([])
  const [fail, setFail] = useState(false)
  const failing = useRef(fail)
  const next = useRef(0)
  const [draft, setDraft] = useState(0)
  const settle = (id: number, text: string) => {
    setPlaced((current) =>
      current.map((entry) =>
        entry.id === id ? { ...entry, text, state: "sending" } : entry
      )
    )
    window.setTimeout(
      () =>
        setPlaced((current) =>
          current.map((entry) =>
            entry.id === id
              ? { ...entry, state: failing.current ? "failed" : "sent" }
              : entry
          )
        ),
      900
    )
  }
  const send = () => {
    const body = text.trim()
    if (body === "") return
    next.current += 1
    const id = next.current
    setPlaced((current) => [...current, { id, text: body, state: "sending" }])
    setText("")
    setDraft((current) => current + 1)
    settle(id, body)
  }
  const discard = (id: number) =>
    setPlaced((current) => current.filter((entry) => entry.id !== id))
  return (
    <EditorKit>
      <div className="grid w-full max-w-xl content-start gap-4">
        <div className="flex items-center gap-2 text-caption text-muted-foreground">
          <Switch
            aria-label="Fail to send"
            checked={fail}
            onCheckedChange={(next) => {
              failing.current = next
              setFail(next)
            }}
          />
          <span aria-hidden>Fail to send</span>
        </div>
        <Timeline>
          <TimelineEvent
            mark={<MemberAvatar member={ANA} size={20} />}
            actor={<Name>Ana Ruiz</Name>}
            time={<Ago>2 days ago</Ago>}
          >
            created this
          </TimelineEvent>
          <TimelineEntry>
            <CommentThread>
              <Said member={BRAM} time="yesterday">
                Android is about two days behind.
              </Said>
            </CommentThread>
          </TimelineEntry>
          {placed.map((entry) => (
            <TimelineEntry key={entry.id} appear>
              <CommentThread>
                {entry.state === "failed" ? (
                  <Unsent
                    member={CHIDI}
                    onRetry={(body) => settle(entry.id, body)}
                    onDiscard={() => discard(entry.id)}
                  >
                    {entry.text}
                  </Unsent>
                ) : (
                  <Said
                    member={CHIDI}
                    time="just now"
                    pending={entry.state === "sending"}
                  >
                    {entry.text}
                  </Said>
                )}
              </CommentThread>
            </TimelineEntry>
          ))}
        </Timeline>
        <CommentComposer
          submit={
            <Button size="sm" onClick={send} disabled={text.trim() === ""}>
              Comment
            </Button>
          }
        >
          <LexicalEditor
            key={draft}
            compact
            markdown=""
            placeholder="Write a comment…"
            onDraftChange={setText}
            onSubmit={send}
          />
        </CommentComposer>
      </div>
    </EditorKit>
  )
}
