import { Button } from "@pp/ui/button"
import { Composer } from "@pp/ui/composer"
import { Input } from "@pp/ui/input"
import { SegmentedTabs } from "@pp/ui/segmented-tabs"
import { TextSwap } from "@pp/ui/text-swap"
import { Paperclip } from "lucide-react"
import { useState } from "react"

const KINDS = [
  { key: "bug", label: "Bug" },
  { key: "feature", label: "Feature request" }
] as const

type Kind = (typeof KINDS)[number]["key"]

// The sidebar's Send feedback button (SendFeedbackForm). LexicalEditor is
// app-only; a textarea stands in with the editor's content classes.
export default function Feedback() {
  const [kind, setKind] = useState<Kind>("bug")
  const [title, setTitle] = useState("")
  const placeholder =
    kind === "bug" ? "What went wrong?" : "What would you like?"
  return (
    <div className="flex w-full items-start justify-center">
      <Composer.Surface>
        <form
          onSubmit={(event) => {
            event.preventDefault()
          }}
          className="flex flex-col"
          aria-label="Send feedback"
        >
          <Composer.Header control>
            <SegmentedTabs
              variant="rail"
              aria-label="Feedback type"
              items={KINDS}
              value={kind}
              onValueChange={setKind}
            />
            <h2 className="sr-only">Send feedback</h2>
          </Composer.Header>
          <Composer.Title className="grid leading-6">
            <Input
              variant="bare"
              value={title}
              maxLength={200}
              aria-label="Title"
              aria-placeholder={placeholder}
              onChange={(event) => setTitle(event.target.value)}
              className="col-start-1 row-start-1 leading-6"
            />
            {title === "" ? (
              <span
                aria-hidden
                className="pointer-events-none col-start-1 row-start-1 grid text-muted-foreground"
              >
                <TextSwap className="col-start-1 row-start-1">
                  {placeholder}
                </TextSwap>
              </span>
            ) : null}
          </Composer.Title>
          <Composer.Body>
            <div className="prose-md">
              <textarea
                aria-label="Steps, what you expected, anything that helps"
                placeholder="Steps, what you expected, anything that helps"
                className="lexical-content block min-h-[8rem] w-full resize-none bg-transparent text-body outline-none placeholder:text-muted-foreground"
              />
            </div>
          </Composer.Body>
          <Composer.Tray>
            <Composer.Fields>
              <Button type="button" variant="ghost" tone="strong">
                <Paperclip className="size-3.5" strokeWidth={1.75} />
                <span>Attach files</span>
              </Button>
            </Composer.Fields>
            <Composer.Footer>
              <Composer.Hint>
                Paste, drop, or attach up to 5 files
              </Composer.Hint>
              <Composer.Actions>
                <Button type="button" variant="ghost" size="sm">
                  Cancel
                </Button>
                <Button type="submit" size="sm">
                  Send
                </Button>
              </Composer.Actions>
            </Composer.Footer>
          </Composer.Tray>
        </form>
      </Composer.Surface>
    </div>
  )
}
