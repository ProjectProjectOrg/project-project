import { LexicalEditor } from "@pp/ui/editor/lexical-editor"

import { EditorKit, SAMPLE_BLOCKS } from "../../kit"

// Type "/" anywhere (or after a space) to open it at the caret.
export default function SlashMenuInTheEditor() {
  return (
    <EditorKit>
      <div className="w-full max-w-2xl self-start rounded-[18px] surface-card p-5 corner-squircle">
        <LexicalEditor
          markdown={"Rollout notes for the redirect fix.\n\n"}
          placeholder="Type / for sections…"
          blocks={SAMPLE_BLOCKS}
        />
      </div>
    </EditorKit>
  )
}
