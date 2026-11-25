import { useAtomSet } from "@effect/atom-react"
import type { Group } from "@pp/shared"
import { Button } from "@pp/ui/button"
import { Composer } from "@pp/ui/composer"
import { MentionScopeProvider } from "@pp/ui/editor/mentions/scope"
import { CalendarDays } from "@pp/ui/icons"
import { Input } from "@pp/ui/input"
import * as Cause from "effect/Cause"
import * as Exit from "effect/Exit"
import { useState, type FormEvent, type KeyboardEvent } from "react"

import { LexicalEditor } from "@/features/editor/components/LexicalEditor"
import {
  sprintListRequest,
  updateSprint
} from "@/features/sprints/atoms/sprintList"
import { SprintDatesPicker } from "@/features/sprints/components/SprintDatesPicker"
import {
  formatSprintDates,
  sprintDateDraft,
  sprintDatesPatch,
  type SprintDateDraft
} from "@/features/sprints/lib/sprintDates"
import { errorMessage } from "@/lib/errorMessage"
import { m } from "@/paraglide/messages"

export function EditSprintForm({
  orgSlug,
  slug,
  sprint,
  body,
  onDone
}: Readonly<{
  orgSlug: string
  slug: string
  sprint: Group
  body: string
  onDone: () => void
}>) {
  const update = useAtomSet(
    updateSprint({ req: sprintListRequest(orgSlug, slug), groupId: sprint.id }),
    { mode: "promiseExit" }
  )
  const [nameDraft, setName] = useState<string | null>(null)
  const name = nameDraft ?? sprint.name
  const [descriptionDraft, setDescription] = useState<string | null>(null)
  const [range, setRange] = useState<SprintDateDraft>(() =>
    sprintDateDraft(sprint)
  )
  const [failure, setFailure] = useState<string | null>(null)
  const trimmed = name.trim()

  const submit = async (event?: FormEvent) => {
    event?.preventDefault()
    if (trimmed === "") return
    const dates = sprintDatesPatch(sprint, range)
    const goal = (descriptionDraft ?? body).trim()
    if (trimmed !== sprint.name || goal !== body.trim() || dates !== null) {
      const exit = await update({ ...dates, name: trimmed, body: goal })
      if (Exit.isFailure(exit)) {
        setFailure(errorMessage(Cause.squash(exit.cause)))
        return
      }
    }
    onDone()
  }

  const onSubmitShortcut = (event: KeyboardEvent) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault()
      void submit()
    }
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="flex flex-col">
      <Composer.Title>
        <Input
          variant="bare"
          autoFocus
          aria-label={m.sprints_new_name_placeholder()}
          placeholder={m.sprints_new_name_placeholder()}
          value={name}
          maxLength={120}
          onKeyDown={onSubmitShortcut}
          onChange={(event) => {
            setName(event.target.value)
            setFailure(null)
          }}
        />
      </Composer.Title>
      <Composer.Body onKeyDownCapture={onSubmitShortcut}>
        <MentionScopeProvider scope={{ orgSlug, slug }}>
          <LexicalEditor
            markdown={body}
            onDraftChange={setDescription}
            placeholder={m.sprints_create_dialog_description_placeholder()}
          />
        </MentionScopeProvider>
      </Composer.Body>
      <Composer.Error>{failure}</Composer.Error>
      <Composer.Tray>
        <Composer.Footer>
          <SprintDatesPicker
            value={range}
            onChange={setRange}
            allowPast
            trigger={
              <Button
                type="button"
                variant="ghost"
                tone="strong"
                size="sm"
                leadingIcon={CalendarDays}
              >
                {formatSprintDates(range) ?? m.sprints_no_dates()}
              </Button>
            }
          />
          {range.from === undefined && (
            <Composer.Hint>{m.sprints_no_dates_hint()}</Composer.Hint>
          )}
          <Composer.Actions>
            <Button type="button" variant="ghost" size="sm" onClick={onDone}>
              {m.common_cancel_button()}
            </Button>
            <Button type="submit" size="sm" disabled={trimmed === ""}>
              {m.common_save_button()}
            </Button>
          </Composer.Actions>
        </Composer.Footer>
      </Composer.Tray>
    </form>
  )
}
