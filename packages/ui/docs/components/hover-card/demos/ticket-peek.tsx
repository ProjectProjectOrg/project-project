import { MentionChip } from "@pp/ui/editor/mentions/mention-chip"

import { EditorKit } from "../../../editor/kit"

// A ticket mentioned in a comment, as the editor renders it: the mention
// chip, and on hover the ticket's peek (title, status, the start of its
// description) in a hover card at 20rem with 12px padding.
export default function TicketPeek() {
  return (
    <EditorKit>
      <p className="prose-md max-w-md">
        This waits on <MentionChip type="ticket" id="ATL-5" label="ATL-5" />{" "}
        before the banner can ship.
      </p>
    </EditorKit>
  )
}
