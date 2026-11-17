import { CommentThread } from "@pp/ui/comment"
import { Timeline, TimelineEntry } from "@pp/ui/timeline"

import { EditorKit } from "../../../editor/kit"
import { BRAM } from "../../timeline/demos/parts/timeline-parts"
import { Said } from "./parts/comment-parts"

// The comment's menu, open: edit (the author), resolve or reopen the thread,
// create a ticket or sub-ticket from the comment, copy a link or the
// Markdown, and delete, which confirms in place. The app leaves out what
// the viewer can't do. The same items open on right-click.
export default function Menu() {
  return (
    <EditorKit>
      <div className="w-full max-w-xl">
        <Timeline>
          <TimelineEntry>
            <CommentThread>
              <Said member={BRAM} time="3 days ago" menuOpen>
                Here&apos;s the crash log from the Pixel 6.
              </Said>
            </CommentThread>
          </TimelineEntry>
        </Timeline>
      </div>
    </EditorKit>
  )
}
