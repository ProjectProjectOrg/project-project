import { LexicalEditor } from "@pp/ui/editor/lexical-editor"

import { EditorKit } from "../../kit"

// Type "@" and a name or a ticket's title or key: "@ma", "@redirect",
// "@ATL-1".
export default function MentionsInTheEditor() {
  return (
    <EditorKit>
      <div className="w-full max-w-2xl self-start rounded-[18px] bg-card p-6 corner-squircle">
        <LexicalEditor
          markdown={
            "[Jonas Berg](mention:user/jonas) can take this after [ATL-5](mention:ticket/ATL-5) lands. "
          }
          placeholder="Type @ to mention someone or a ticket…"
        />
      </div>
    </EditorKit>
  )
}
