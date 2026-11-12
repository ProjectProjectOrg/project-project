import { RegistryContext, useAtomSet, useAtomValue } from "@effect/atom-react"
import {
  TicketStatus as TicketStatusSchema,
  type Estimate,
  type GroupId,
  type TicketPriority,
  type TicketId,
  type TicketStatus,
  isEpicType
} from "@pp/shared"
import { useNavigate } from "@tanstack/react-router"
import * as Cause from "effect/Cause"
import * as Exit from "effect/Exit"
import * as Result from "effect/reactivity/AsyncResult"
import * as Schema from "effect/Schema"
import {
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode
} from "react"

import { fireMutation } from "@/api/viewMutation"
import { Button } from "@/components/ui/button"
import { Composer } from "@/components/ui/composer"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { LexicalEditor } from "@/features/editor/components/LexicalEditor"
import { MentionScopeProvider } from "@/features/editor/mentions/scope"
import {
  project as projectView,
  projectRequest,
  projectsFor,
  projectsRequest
} from "@/features/projects/atoms/projects"
import { ProjectSelect } from "@/features/projects/components/ProjectSelect"
import { ProjectContext } from "@/features/projects/hooks/useProject"
import {
  assignTicketToSprint,
  sprintListRequest
} from "@/features/sprints/atoms/sprintList"
import {
  createTicketDialog,
  createTicketInProject,
  relatedPayload,
  type CreateTicketDialogRequest,
  type RelatedKind
} from "@/features/tickets/atoms/createTicketDialog"
import {
  markTicket,
  ticketRequest
} from "@/features/tickets/atoms/ticketDetail"
import { AssigneeSelect } from "@/features/tickets/components/ticket-list/AssigneeField"
import { CreatorTypeSelect } from "@/features/tickets/components/ticket-list/CreatorMenus"
import { EstimateBadgeTrigger } from "@/features/tickets/components/ticket-list/EstimateField"
import { PrioritySelect } from "@/features/tickets/components/ticket-list/PriorityField"
import { SprintSelect } from "@/features/tickets/components/ticket-list/SprintField"
import { StartsWithLine } from "@/features/tickets/components/ticket-list/StartsWithLine"
import { StatusSelect } from "@/features/tickets/components/ticket-list/StatusField"
import { TicketIdText } from "@/features/tickets/components/TicketIdText"
import {
  useCreatorType,
  type CreatorType
} from "@/features/tickets/hooks/useCreatorType"
import { useRouteBoundDialog } from "@/hooks/useRouteBoundDialog"
import { errorMessage } from "@/lib/errorMessage"
import { m } from "@/paraglide/messages"

const DEFAULT_STATUS = Schema.decodeSync(TicketStatusSchema)("todo")

const RELATED_LABELS: Readonly<
  Record<RelatedKind, (args: { id: string }) => string>
> = {
  subTicket: m.tickets_create_related_sub_ticket,
  blockedBy: m.tickets_create_related_blocks,
  blocking: m.tickets_create_related_blocked_by,
  related: m.tickets_create_related_related
}

export function CreateTicketDialogHost() {
  const { open, shown, close } = useRouteBoundDialog(createTicketDialog)
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) close()
      }}
    >
      <DialogContent size="lg" showCloseButton={false} className="p-0">
        {shown !== null && (
          <CreateTicketForm
            key={`${shown.orgSlug}:${shown.projectSlug ?? ""}:${shown.sprint ?? ""}:${shown.title ?? ""}:${shown.related?.kind ?? ""}:${shown.related?.ticketId ?? ""}`}
            request={shown}
            onDone={close}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function CreateTicketForm({
  request,
  onDone
}: Readonly<{ request: CreateTicketDialogRequest; onDone: () => void }>) {
  const { orgSlug } = request
  const navigate = useNavigate()
  const projectsResult = useAtomValue(projectsFor(projectsRequest(orgSlug)))
  const projects = Result.isSuccess(projectsResult) ? projectsResult.value : []
  const [picked, setPicked] = useState(request.projectSlug)
  const slug = picked ?? projects[0]?.slug ?? null
  const related =
    request.related !== undefined && slug === request.projectSlug
      ? request.related
      : null

  const titleInput = useRef<HTMLInputElement>(null)
  useEffect(() => titleInput.current?.focus(), [])
  const [title, setTitle] = useState(request.title ?? "")
  const [description, setDescription] = useState("")
  const creatorType = useCreatorType({
    orgSlug,
    slug: slug ?? "",
    epics: related?.kind !== "subTicket"
  })
  const [priority, setPriority] = useState<TicketPriority | null>(null)
  const [status, setStatus] = useState<TicketStatus | null>(null)
  const [assignees, setAssignees] = useState<ReadonlyArray<string>>([])
  const [estimate, setEstimate] = useState<Estimate | null>(null)
  const [sprint, setSprint] = useState<GroupId | null>(request.sprint ?? null)
  const registry = useContext(RegistryContext)
  const [failure, setFailure] = useState<string | null>(null)
  const [created, setCreated] = useState<TicketId | null>(null)
  const [pending, setPending] = useState(false)
  const create = useAtomSet(createTicketInProject, { mode: "promiseExit" })
  const trimmed = title.trim()
  const body = description.trim()
  const canSubmit = slug !== null && trimmed !== "" && !pending

  const createTicket = async () => {
    const exit = await create({
      orgSlug,
      slug,
      payload: {
        title: trimmed,
        priority: priority ?? undefined,
        status: status ?? undefined,
        assignees: assignees.length === 0 ? undefined : assignees,
        estimate: estimate ?? undefined,
        ...creatorType.payload,
        body: body === "" ? undefined : body,
        ...relatedPayload(related)
      }
    })
    creatorType.settle(exit)
    if (Exit.isSuccess(exit)) return exit.value.id
    setFailure(errorMessage(Cause.squash(exit.cause)))
    return null
  }

  const submit = async (event?: FormEvent) => {
    event?.preventDefault()
    if (!canSubmit) return
    setFailure(null)
    setPending(true)
    const id = created ?? (await createTicket())
    if (id === null) {
      setPending(false)
      return
    }
    setCreated(id)
    if (related?.kind === "blockedBy") {
      const marked = await fireMutation(
        registry,
        markTicket(ticketRequest(orgSlug, slug, related.ticketId)),
        { kind: "blockedBy", target: id }
      )
      if (Result.isFailure(marked)) {
        setPending(false)
        setFailure(errorMessage(Cause.squash(marked.cause)))
        return
      }
    }
    if (sprint !== null && !isEpicType(creatorType.type)) {
      assignTicketToSprint(
        registry,
        sprintListRequest(orgSlug, slug),
        id,
        sprint
      )
    }
    onDone()
    void navigate({
      to: "/orgs/$orgSlug/projects/$slug/tickets/$id",
      params: { orgSlug, slug, id },
      search: body === "" ? { focusBody: "1" } : {}
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
          onChange={(next) => {
            setPicked(next)
            creatorType.reset()
            setPriority(null)
            setCreated(null)
            setStatus(null)
            setAssignees([])
            setEstimate(null)
            setSprint(null)
          }}
        />
        <DialogTitle className="text-body font-normal text-muted-foreground">
          {m.tickets_create_dialog_title()}
        </DialogTitle>
        {related !== null && (
          <span className="truncate text-body text-muted-foreground">
            ·{" "}
            <TicketIdText id={related.ticketId}>
              {RELATED_LABELS[related.kind]({ id: related.ticketId })}
            </TicketIdText>
          </span>
        )}
      </Composer.Header>
      <Composer.Title>
        <Input
          variant="composer-title"
          aria-label={m.tickets_create_title_aria_label()}
          aria-required
          placeholder={m.tickets_create_dialog_title_placeholder()}
          value={title}
          maxLength={200}
          onKeyDown={onSubmitShortcut}
          onChange={(event) => {
            setTitle(event.target.value)
            setFailure(null)
          }}
          ref={titleInput}
        />
      </Composer.Title>
      <Composer.Body onKeyDownCapture={onSubmitShortcut}>
        <MentionScopeProvider scope={{ orgSlug, slug: slug ?? "" }}>
          <LexicalEditor
            markdown=""
            onDraftChange={setDescription}
            placeholder={m.tickets_create_dialog_description_placeholder()}
          />
        </MentionScopeProvider>
      </Composer.Body>
      <Composer.Chips>
        {slug === null ? null : (
          <ProjectScope orgSlug={orgSlug} slug={slug}>
            <CreateTicketChips
              key={slug}
              orgSlug={orgSlug}
              slug={slug}
              status={status}
              onStatus={setStatus}
              creatorType={creatorType}
              priority={priority ?? creatorType.prediction?.priority ?? "med"}
              onPriority={setPriority}
              assignees={assignees}
              onAssignees={setAssignees}
              estimate={estimate}
              onEstimate={setEstimate}
              sprint={sprint}
              onSprint={setSprint}
            />
          </ProjectScope>
        )}
      </Composer.Chips>
      {body === "" && (
        <StartsWithLine start={creatorType.start} className="px-4 pt-2" />
      )}
      <Composer.Error>{failure}</Composer.Error>
      <Composer.Footer>
        <DialogClose
          render={<Button type="button" variant="ghost" size="sm" />}
        >
          {m.common_cancel_button()}
        </DialogClose>
        <Button type="submit" size="sm" disabled={!canSubmit}>
          {m.tickets_create_dialog_submit()}
        </Button>
      </Composer.Footer>
    </form>
  )
}

function CreateTicketChips({
  orgSlug,
  slug,
  status,
  onStatus,
  creatorType,
  priority,
  onPriority,
  assignees,
  onAssignees,
  estimate,
  onEstimate,
  sprint,
  onSprint
}: Readonly<{
  orgSlug: string
  slug: string
  status: TicketStatus | null
  onStatus: (status: TicketStatus) => void
  creatorType: CreatorType
  priority: TicketPriority
  onPriority: (priority: TicketPriority) => void
  assignees: ReadonlyArray<string>
  onAssignees: (assignees: ReadonlyArray<string>) => void
  estimate: Estimate | null
  onEstimate: (estimate: Estimate | null) => void
  sprint: GroupId | null
  onSprint: (sprint: GroupId | null) => void
}>) {
  const detail = useAtomValue(projectView(projectRequest(orgSlug, slug)))
  const members = Result.isSuccess(detail) ? detail.value.members : []
  const estimation = Result.isSuccess(detail) ? detail.value.estimation : "off"
  return (
    <>
      <StatusSelect
        manageAction={false}
        value={status ?? DEFAULT_STATUS}
        onChange={onStatus}
        showLabel
      />
      <CreatorTypeSelect
        orgSlug={orgSlug}
        slug={slug}
        type={creatorType.type}
        lastUsed={creatorType.lastUsed}
        epics={creatorType.epics}
        onTypeChange={creatorType.pick}
      />
      <PrioritySelect value={priority} onChange={onPriority} showLabel />
      <AssigneeSelect
        value={assignees}
        onChange={onAssignees}
        members={members}
        variant="chip"
      />
      <EstimateBadgeTrigger
        ticket={{ estimate }}
        mode={estimation}
        onPatch={(patch) => onEstimate(patch.estimate ?? null)}
      />
      {!isEpicType(creatorType.type) && (
        <SprintSelect value={sprint} onChange={onSprint} />
      )}
    </>
  )
}

function ProjectScope({
  orgSlug,
  slug,
  children
}: Readonly<{ orgSlug: string; slug: string; children: ReactNode }>) {
  const request = useMemo(() => projectRequest(orgSlug, slug), [orgSlug, slug])
  return (
    <ProjectContext.Provider value={request}>
      {children}
    </ProjectContext.Provider>
  )
}
