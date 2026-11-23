import { Button } from "@pp/ui/button"
import { Composer } from "@pp/ui/composer"
import {
  Circle,
  Link2,
  Minus,
  Plus,
  SquareCheck,
  UserRound
} from "@pp/ui/icons"
import { Input } from "@pp/ui/input"
import { useState } from "react"

// The ticket page's Sub-tickets › Add sub-tickets (SubTicketComposer): an
// inline card, not a popover. LexicalEditor (compact) is app-only; a
// textarea stands in with the editor's content classes.
export default function SubTicket() {
  const [title, setTitle] = useState("")
  return (
    <div className="flex w-full items-start justify-center">
      <div className="w-full max-w-2xl">
        <form
          onSubmit={(event) => event.preventDefault()}
          className="flex flex-col overflow-hidden rounded-[20px] border border-border/60 surface-background [--fs-body:13px] [--lh-body:20px] [--text-body--line-height:20px] [--text-body:13px] [corner-shape:var(--button-corner)]"
        >
          <Composer.Title>
            <Input
              variant="bare"
              aria-label="Ticket title"
              placeholder="Sub-ticket title"
              value={title}
              maxLength={200}
              onChange={(event) => setTitle(event.target.value)}
            />
          </Composer.Title>
          <Composer.Body className="[&_.lexical-content]:min-h-10">
            <div className="prose-md prose-compact">
              <textarea
                aria-label="Add a description…"
                placeholder="Add a description…"
                className="lexical-content block min-h-[1.5rem] w-full resize-none bg-transparent text-body outline-none placeholder:text-muted-foreground"
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
                  className="size-3.5 text-state-info"
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
            </Composer.Fields>
            <Composer.Footer>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                leadingIcon={Link2}
              >
                Add existing
              </Button>
              <Composer.Actions>
                <Button type="button" variant="ghost" size="sm">
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={title.trim() === ""}>
                  Create sub-ticket
                </Button>
              </Composer.Actions>
            </Composer.Footer>
          </Composer.Tray>
        </form>
      </div>
    </div>
  )
}
