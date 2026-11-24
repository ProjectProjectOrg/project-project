import { RegistryContext, useAtomSet, useAtomValue } from "@effect/atom-react"
import type { Group } from "@pp/shared"
import { Button } from "@pp/ui/button"
import { Composer } from "@pp/ui/composer"
import { MentionScopeProvider } from "@pp/ui/editor/mentions/scope"
import { ArrowRightLeft, CalendarDays } from "@pp/ui/icons"
import { Input } from "@pp/ui/input"
import { useNavigate } from "@tanstack/react-router"
import * as Cause from "effect/Cause"
import * as DateTime from "effect/DateTime"
import * as Exit from "effect/Exit"
import * as Result from "effect/reactivity/AsyncResult"
import {
  useContext,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent
} from "react"

import { fireMutation } from "@/api/viewMutation"
import { LexicalEditor } from "@/features/editor/components/LexicalEditor"
import {
  projectsFor,
  projectsRequest
} from "@/features/projects/atoms/projects"
import {
  createSprintInProject,
  type CreateSprintRequest
} from "@/features/sprints/atoms/createSprint"
import {
  completeSprint,
  sprintListRequest
} from "@/features/sprints/atoms/sprintList"
import { useUnfinishedCount } from "@/features/sprints/components/CompleteSprintMenu"
import { SprintStateIcon } from "@/features/sprints/components/SprintChip"
import { SprintDatesPicker } from "@/features/sprints/components/SprintDatesPicker"
import {
  formatSprintDates,
  type SprintDateDraft
} from "@/features/sprints/lib/sprintDates"
import { errorMessage } from "@/lib/errorMessage"
import { m } from "@/paraglide/messages"

const datesLabel = (draft: SprintDateDraft) =>
  formatSprintDates(draft) ?? m.sprints_no_dates()

export function CreateSprintForm({
  request,
  onDone
}: Readonly<{
  request: CreateSprintRequest
  onDone: () => void
}>) {
  const { orgSlug, completeFrom, tickets } = request
  const registry = useContext(RegistryContext)
  const navigate = useNavigate()
  const projectsResult = useAtomValue(projectsFor(projectsRequest(orgSlug)))
  const projects = Result.isSuccess(projectsResult) ? projectsResult.value : []
  // The popover opens inside one project; the first project is a fallback.
  const slug = request.projectSlug ?? projects[0]?.slug ?? null
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [range, setRange] = useState<SprintDateDraft>({})
  const [submission, setSubmission] = useState<
    "idle" | "pending" | Readonly<{ error: string }>
  >("idle")
  const created = useRef<Group["id"] | null>(null)
  const submitting = useRef(false)
  const pending = submission === "pending"
  const create = useAtomSet(createSprintInProject, { mode: "promiseExit" })
  const trimmed = name.trim()
  const body = description.trim()
  const canSubmit = slug !== null && trimmed !== "" && !pending
  const today = DateTime.toDate(DateTime.nowUnsafe())
  const startsNow = range.from !== undefined && range.from <= today

  const createSprint = async () => {
    const exit = await create({
      orgSlug,
      slug,
      payload: {
        name: trimmed,
        body: body === "" ? undefined : body,
        startsAt: range.from ?? null,
        endsAt: range.to ?? null,
        tickets
      }
    })
    if (Exit.isSuccess(exit)) return exit.value.id
    setSubmission({ error: errorMessage(Cause.squash(exit.cause)) })
    return null
  }

  const persist = async () => {
    if (slug === null) return
    const groupId = created.current ?? (await createSprint())
    if (groupId === null) return
    created.current = groupId
    if (completeFrom !== undefined) {
      const completion = await fireMutation(
        registry,
        completeSprint({
          req: sprintListRequest(orgSlug, slug),
          groupId: completeFrom.id
        }),
        { destination: { kind: "sprint", groupId } }
      )
      if (Result.isFailure(completion)) {
        setSubmission({ error: errorMessage(Cause.squash(completion.cause)) })
        return
      }
    }
    onDone()
    if (range.from === undefined) return
    void navigate({
      to: "/orgs/$orgSlug/projects/$slug/sprints/$groupId",
      params: { orgSlug, slug, groupId }
    })
  }

  const submit = (event?: FormEvent) => {
    event?.preventDefault()
    if (!canSubmit || submitting.current) return
    submitting.current = true
    setSubmission("pending")
    void persist().finally(() => {
      submitting.current = false
      setSubmission((current) => (current === "pending" ? "idle" : current))
    })
  }

  const onSubmitShortcut = (event: KeyboardEvent) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault()
      submit()
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col">
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
            setSubmission((current) =>
              typeof current === "object" ? "idle" : current
            )
          }}
        />
      </Composer.Title>
      <Composer.Body onKeyDownCapture={onSubmitShortcut}>
        <MentionScopeProvider scope={{ orgSlug, slug: slug ?? "" }}>
          <LexicalEditor
            markdown=""
            onDraftChange={setDescription}
            placeholder={m.sprints_create_dialog_description_placeholder()}
          />
        </MentionScopeProvider>
      </Composer.Body>
      {completeFrom !== undefined && slug !== null && (
        <CompleteFromLine orgSlug={orgSlug} slug={slug} sprint={completeFrom} />
      )}
      <Composer.Error>
        {typeof submission === "object" ? submission.error : null}
      </Composer.Error>
      <Composer.Tray>
        <Composer.Footer>
          <SprintDatesPicker
            value={range}
            onChange={setRange}
            allowPast={false}
            // Clears the tray's 6px padding, so the gap is to the composer.
            sideOffset={10}
            trigger={
              <Button
                type="button"
                variant="ghost"
                tone="strong"
                size="sm"
                leadingIcon={CalendarDays}
              >
                {datesLabel(range)}
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
            <Button type="submit" size="sm" disabled={!canSubmit}>
              {startsNow
                ? m.sprints_create_dialog_submit_start()
                : m.sprints_create_dialog_submit()}
            </Button>
          </Composer.Actions>
        </Composer.Footer>
      </Composer.Tray>
    </form>
  )
}

function CompleteFromLine({
  orgSlug,
  slug,
  sprint
}: Readonly<{ orgSlug: string; slug: string; sprint: Group }>) {
  const unfinished = useUnfinishedCount({ orgSlug, slug, sprint })
  return (
    <div className="flex items-center pr-4 pl-1.5">
      <span className="flex h-8 min-w-0 items-center gap-1.5 px-2.5 text-caption text-muted-foreground">
        <ArrowRightLeft className="size-3.5 shrink-0" strokeWidth={1.75} />
        {m.sprints_create_dialog_complete_prefix()}
        <span className="inline-flex h-5 min-w-0 items-center gap-1 rounded-md bg-hover px-1.5 text-foreground">
          <SprintStateIcon sprint={sprint} size="xs" />
          <span className="truncate">{sprint.name}</span>
        </span>
        {unfinished !== null && unfinished > 0 && (
          <span className="shrink-0">
            {m.sprints_create_dialog_complete_moves({ count: unfinished })}
          </span>
        )}
      </span>
    </div>
  )
}
