import { Markdown } from "@pp/ui/editor/markdown"

import { EditorKit, FIGMA_CHIP_URL, IMAGE_URL } from "../../kit"

const BODY = `## Sign-in redirect

After a session expires, signing in again should bring you back to the page you were on. [Maya Chen](mention:user/maya) saw it on [ATL-8](mention:ticket/ATL-8) too; the flow is [Onboarding, three screens](${FIGMA_CHIP_URL}).

- [x] Keep the path in \`?next=\`
- [ ] Only same-origin paths

> Only same-origin paths, so it can't become an open redirect.

| Case | Lands on |
| --- | --- |
| Expired session | The page you were on |
| Signed out | Home |

![Sign-in screen](${IMAGE_URL})

\`\`\`ts
const next = safeNext(url.searchParams.get("next"))
\`\`\``

// A description someone can't edit, and a comment (compact).
export default function MarkdownOverview() {
  return (
    <EditorKit>
      <div className="@container grid w-full gap-4 @3xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="min-w-0 rounded-[18px] bg-card p-6 corner-squircle">
          <Markdown>{BODY}</Markdown>
        </div>
        <div className="min-w-0 self-start rounded-[18px] bg-card p-4 corner-squircle">
          <Markdown size="compact">
            {
              "Pushed a fix: [ATL-5](mention:ticket/ATL-5) keeps `?next=` now. **Ready for review.**"
            }
          </Markdown>
        </div>
      </div>
    </EditorKit>
  )
}
