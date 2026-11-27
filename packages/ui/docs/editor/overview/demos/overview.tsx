import { LexicalEditor } from "@pp/ui/editor/lexical-editor"
import { useState } from "react"

import {
  EditorKit,
  FIGMA_CHIP_URL,
  IMAGE_URL,
  SAMPLE_BLOCKS,
  SAMPLE_TARGET
} from "../../kit"

const START = `After a session expires, signing in again should bring you back to the page you were on, not the dashboard. [Maya Chen](mention:user/maya) saw it on [ATL-8](mention:ticket/ATL-8) too.

<block type="acceptance-criteria">

## Acceptance criteria

- [x] Keep the path in \`?next=\`
- [ ] Only same-origin paths, so it can't become an open redirect
- [ ] Cover it with a test

</block>

The new sign-in screen; the flow it's part of is [Onboarding, three screens](${FIGMA_CHIP_URL}).

![Sign-in screen](${IMAGE_URL}?d=compact)

\`\`\`ts
const next = safeNext(url.searchParams.get("next"))
\`\`\``

// A ticket description, as the ticket page edits it: blocks, mentions,
// attachments and a Figma frame, with the Markdown it saves beside it.
export default function EditorOverview() {
  const [markdown, setMarkdown] = useState(START)
  return (
    <EditorKit>
      <div className="@container w-full">
        <div className="grid gap-4 @4xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <div className="min-w-0 rounded-[18px] surface-card p-5 corner-squircle">
            <LexicalEditor
              markdown={START}
              onDraftChange={setMarkdown}
              placeholder="Add a description…"
              attachments={SAMPLE_TARGET}
              blocks={SAMPLE_BLOCKS}
            />
          </div>
          <pre
            // Scrolls when long, so it takes keyboard focus.
            // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- a scrollable region
            tabIndex={0}
            className="max-h-[36rem] min-w-0 overflow-auto rounded-[18px] bg-[color-mix(in_oklab,var(--foreground)_4%,transparent)] p-5 font-mono text-micro whitespace-pre-wrap text-muted-foreground corner-squircle"
          >
            {markdown}
          </pre>
        </div>
      </div>
    </EditorKit>
  )
}
