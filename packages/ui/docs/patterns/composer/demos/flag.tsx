import { Button } from "@pp/ui/button"
import { Composer } from "@pp/ui/composer"
import { Flag } from "lucide-react"

// A ticket's "…" menu › Flag (FlagTicket). LexicalEditor is app-only; a
// textarea stands in with the editor's content classes.
export default function FlagTicket() {
  return (
    <div className="flex w-full items-start justify-center">
      <Composer.Surface>
        <form
          className="flex flex-col"
          onSubmit={(event) => {
            event.preventDefault()
          }}
        >
          <Composer.Header>
            <h3 className="inline-flex items-center gap-1.5 font-normal text-foreground">
              <Flag className="size-3.5" strokeWidth={1.75} />
              Flag
            </h3>
            <span className="tabular-nums">PP-214</span>
          </Composer.Header>
          <Composer.Title className="truncate">
            Fix the login redirect after an expired session
          </Composer.Title>
          <Composer.Body>
            <div className="prose-md">
              <textarea
                aria-label="What needs attention? (optional)"
                placeholder="What needs attention? (optional)"
                className="lexical-content block min-h-[8rem] w-full resize-none bg-transparent text-body outline-none placeholder:text-muted-foreground"
              />
            </div>
          </Composer.Body>
          <Composer.Tray>
            <Composer.Footer>
              <Composer.Hint>
                Stays flagged until it's done or unflagged.
              </Composer.Hint>
              <Composer.Actions>
                <Button type="button" variant="ghost" size="sm">
                  Cancel
                </Button>
                <Button type="submit" size="sm">
                  Flag
                </Button>
              </Composer.Actions>
            </Composer.Footer>
          </Composer.Tray>
        </form>
      </Composer.Surface>
    </div>
  )
}
