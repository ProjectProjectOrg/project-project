import { Button } from "@pp/ui/button"
import { Composer } from "@pp/ui/composer"
import { Circle, Minus, Plus, SquareCheck, UserRound } from "@pp/ui/icons"
import { Input } from "@pp/ui/input"
import { useState } from "react"

// A ticket's "…" menu › New ticket that blocks it (CreateTicketForm). LexicalEditor is
// app-only; a textarea stands in with the editor's content classes.
export default function CreateTicket() {
  const [title, setTitle] = useState("")
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
            <span className="truncate">
              Blocks <span className="tabular-nums">PP-214</span>
            </span>
          </Composer.Header>
          <Composer.Title>
            <Input
              variant="bare"
              aria-label="Ticket title"
              aria-required
              placeholder="Ticket title"
              value={title}
              maxLength={200}
              onChange={(event) => setTitle(event.target.value)}
            />
          </Composer.Title>
          <Composer.Body>
            <div className="prose-md">
              <textarea
                aria-label="Add a description…"
                placeholder="Add a description…"
                className="lexical-content block min-h-[8rem] w-full resize-none bg-transparent text-body outline-none placeholder:text-muted-foreground"
              />
            </div>
          </Composer.Body>
          <Composer.Tray>
            <Composer.Fields>
              <Button type="button" variant="ghost" tone="strong">
                <Circle
                  className="size-3.5 text-muted-foreground"
                  strokeWidth={1.75}
                />
                <span>Todo</span>
              </Button>
              <Button type="button" variant="ghost" tone="strong">
                <SquareCheck
                  className="size-3.5 text-sky-500"
                  strokeWidth={1.75}
                />
                <span>Task</span>
              </Button>
              <Button type="button" variant="ghost" tone="strong">
                <Minus
                  className="size-3.5 text-state-warning"
                  strokeWidth={1.75}
                />
                <span>Medium</span>
              </Button>
              <Button type="button" variant="ghost" tone="muted">
                <UserRound className="size-3.5" strokeWidth={1.75} />
                <span>Unassigned</span>
              </Button>
              <Button type="button" variant="ghost" tone="muted">
                <Plus className="size-3.5" strokeWidth={1.75} />
                <span>Add estimate</span>
              </Button>
              <Button type="button" variant="ghost" tone="muted">
                <Plus className="size-3.5" strokeWidth={1.75} />
                <span>Assign sprint</span>
              </Button>
            </Composer.Fields>
            <Composer.Footer>
              <Composer.Hint>
                Starts with Context, Acceptance criteria
              </Composer.Hint>
              <Composer.Actions>
                <Button type="button" variant="ghost" size="sm">
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={title.trim() === ""}>
                  Create ticket
                </Button>
              </Composer.Actions>
            </Composer.Footer>
          </Composer.Tray>
        </form>
      </Composer.Surface>
    </div>
  )
}
