import { Markdown } from "@pp/ui/editor/markdown"

import { EditorKit } from "../../kit"

const BODY = `<block type="context">

## Context

After a session expires, signing in again lands on the dashboard instead of the page you were on.

</block>

<block type="definition-of-done" sync>

## Definition of done

- [x] Reviewed and merged
- [ ] Tests cover the change

</block>`

// The same blocks, read-only (a description someone can't edit): framed,
// with their icons in the margin.
export default function BlocksReadOnly() {
  return (
    <EditorKit>
      <div className="w-full max-w-2xl self-start rounded-[18px] bg-card p-5 corner-squircle">
        <Markdown>{BODY}</Markdown>
      </div>
    </EditorKit>
  )
}
