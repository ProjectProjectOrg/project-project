import { RegistryContext, useAtomSet, useAtomValue } from "@effect/atom-react"
import type { Group } from "@pp/shared"
import { useNavigate } from "@tanstack/react-router"
import * as Cause from "effect/Cause"
import * as DateTime from "effect/DateTime"
import * as Exit from "effect/Exit"
import * as Result from "effect/reactivity/AsyncResult"
import { ArrowRightLeft, CalendarDays } from "lucide-react"
import {
  useContext,
  useState,
  type ComponentType,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode
} from "react"

import { fireMutation } from "@/api/viewMutation"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Composer } from "@/components/ui/composer"
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from "@/components/ui/popover"
import { LexicalEditor } from "@/features/editor/components/LexicalEditor"
import { MentionScopeProvider } from "@/features/editor/mentions/scope"
import {
  projectsFor,
  projectsRequest
} from "@/features/projects/atoms/projects"
import { ProjectSelect } from "@/features/projects/components/ProjectSelect"
import {
  createSprintInProject,
  type CreateSprintDialogRequest
} from "@/features/sprints/atoms/createSprintDialog"
import {
  completeSprint,
  sprintListRequest
} from "@/features/sprints/atoms/sprintList"
import { useUnfinishedCount } from "@/features/sprints/components/CompleteSprintMenu"
import { SprintStateIcon } from "@/features/sprints/components/SprintChip"
import {
  defaultSprintRange,
  formatSprintRange,
  type SprintDateDraft
} from "@/features/sprints/lib/sprintDates"
import { errorMessage } from "@/lib/errorMessage"
import { m } from "@/paraglide/messages"
import { getLocale } from "@/paraglide/runtime"

const datesLabel = ({ from, to }: SprintDateDraft) => {
  if (from === undefined) return m.sprints_no_dates()
  if (to === undefined) {
    const date = new Intl.DateTimeFormat(getLocale(), {
      month: "short",
      day: "numeric"
    }).format(from)
    return m.sprints_starts_on({ date })
  }
  return formatSprintRange(from, to)
}

export function CreateSprintForm({
  request,
  Title,
  onDone
}: Readonly<{
  request: CreateSprintDialogRequest
  Title: ComponentType<{ className?: string; children: ReactNode }>
  onDone: () => void
}>) {
  const { orgSlug, completeFrom, tickets } = request
  const registry = useContext(RegistryContext)
  const navigate = useNavigate()
  const projectsResult = useAtomValue(projectsFor(projectsRequest(orgSlug)))
  const projects = Result.isSuccess(projectsResult) ? projectsResult.value : []
  const [picked, setPicked] = useState(request.projectSlug)
  const slug = picked ?? projects[0]?.slug ?? null
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [range, setRange] = useState<SprintDateDraft>({})
  const [pickerOpen, setPickerOpen] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const [created, setCreated] = useState<Group["id"] | null>(null)
  const [pending, setPending] = useState(false)
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
    setFailure(errorMessage(Cause.squash(exit.cause)))
    return null
  }

  const submit = async (event?: FormEvent) => {
    event?.preventDefault()
    if (!canSubmit) return
    setFailure(null)
    setPending(true)
    const groupId = created ?? (await createSprint())
    if (groupId === null) {
      setPending(false)
      return
    }
    setCreated(groupId)
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
        setPending(false)
        setFailure(errorMessage(Cause.squash(completion.cause)))
        return
      }
    }
    onDone()
    void navigate({
      to: "/orgs/$orgSlug/projects/$slug/sprints/$groupId",
      params: { orgSlug, slug, groupId }
    })
  }

  const onSubmitShortcut = (event: KeyboardEvent) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault()
      void submit()
    }
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="flex flex-col">
      <Composer.Header>
        <ProjectSelect
          projects={projects}
          value={slug}
          onChange={setPicked}
          readOnly={completeFrom !== undefined || tickets !== undefined}
        />
        <Title className="text-body font-normal text-muted-foreground">
          {m.sprints_create_dialog_title()}
        </Title>
      </Composer.Header>
      <Composer.Title>
        <Composer.TitleInput
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
        <MentionScopeProvider scope={{ orgSlug, slug: slug ?? "" }}>
          <LexicalEditor
            markdown=""
            onDraftChange={setDescription}
            placeholder={m.sprints_create_dialog_description_placeholder()}
          />
        </MentionScopeProvider>
      </Composer.Body>
      <Composer.Chips>
        <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
          <PopoverTrigger render={<Button type="button" variant="chip" />}>
            <CalendarDays className="size-3.5" strokeWidth={1.75} />
            <span>{datesLabel(range)}</span>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            initialFocus={false}
            className="w-auto p-0"
          >
            <Calendar
              mode="range"
              selected={{ from: range.from, to: range.to }}
              onSelect={(next) => setRange(next ?? {})}
              disabled={{ before: today }}
              defaultMonth={range.from ?? today}
            />
            <div className="flex justify-between gap-2 border-t border-border/60 p-2">
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={() => {
                  setRange(defaultSprintRange())
                  setPickerOpen(false)
                }}
              >
                {m.sprints_start_today()}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                disabled={range.from === undefined}
                onClick={() => {
                  setRange({})
                  setPickerOpen(false)
                }}
              >
                {m.sprints_clear_dates()}
              </Button>
            </div>
          </PopoverContent>
        </Popover>
        {range.from === undefined && (
          <Composer.Hint>{m.sprints_no_dates_hint()}</Composer.Hint>
        )}
      </Composer.Chips>
      {completeFrom !== undefined && slug !== null && (
        <CompleteFromLine orgSlug={orgSlug} slug={slug} sprint={completeFrom} />
      )}
      <Composer.Error>{failure}</Composer.Error>
      <Composer.Footer>
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>
          {m.common_cancel_button()}
        </Button>
        <Button type="submit" size="sm" disabled={!canSubmit}>
          {startsNow
            ? m.sprints_create_dialog_submit_start()
            : m.sprints_create_dialog_submit()}
        </Button>
      </Composer.Footer>
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
