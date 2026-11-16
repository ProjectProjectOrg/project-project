import { LexicalEditor } from "@pp/ui/editor/lexical-editor"

import { EditorKit, SAMPLE_BLOCKS } from "../../kit"

const BODY = `<block type="context">

## Context

After a session expires, signing in again lands on the dashboard instead of the page you were on.

</block>

<block type="acceptance-criteria">

## Acceptance criteria

- [x] Keep the path in \`?next=\`
- [ ] Only same-origin paths
- [ ] Cover it with a test

</block>

<block type="definition-of-done" sync>

## Definition of done

- [ ] Reviewed and merged
- [ ] Tests cover the change
- [ ] Docs updated where behaviour changed
- [ ] Verified in the target environment

</block>`

// A ticket made of blocks: hover one for its handle in the gutter (drag to
// move it, click for its menu). The last one is synced: it follows the
// team's definition, and only its checkboxes are yours.
export default function BlocksOverview() {
  return (
    <EditorKit>
      <div className="w-full max-w-2xl self-start rounded-[18px] bg-card p-5 corner-squircle">
        <LexicalEditor markdown={BODY} blocks={SAMPLE_BLOCKS} />
      </div>
    </EditorKit>
  )
}
