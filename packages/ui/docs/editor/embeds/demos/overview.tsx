import { LexicalEditor } from "@pp/ui/editor/lexical-editor"

import { EditorKit, FIGMA_CHIP_URL, SAMPLE_TARGET } from "../../kit"

const BODY = `Designs: [Onboarding, three screens](${FIGMA_CHIP_URL}) and the [sign-in exploration](https://app.paper.design/file/01JBXPAPER/sign-in).

Background reading: https://lexical.dev/ and https://commonmark.org/ (pasted URLs become links with their page's icon).`

// What a pasted design link or URL becomes: a Figma frame (hover for its
// thumbnail), a Paper file, and links that show their page.
export default function EmbedsOverview() {
  return (
    <EditorKit>
      <div className="w-full max-w-2xl self-start rounded-[18px] bg-card p-6 corner-squircle">
        <LexicalEditor markdown={BODY} attachments={SAMPLE_TARGET} />
      </div>
    </EditorKit>
  )
}
