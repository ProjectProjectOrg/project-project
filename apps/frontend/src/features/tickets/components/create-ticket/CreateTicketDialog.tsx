import {
  RegistryContext,
  useAtom,
  useAtomSet,
  useAtomValue
} from "@effect/atom-react"
import {
  TicketStatus as TicketStatusSchema,
  type Estimate,
  type GroupId,
  type TicketPriority,
  type TicketStatus,
  type TicketType
} from "@pp/shared"
import { useNavigate, useRouterState } from "@tanstack/react-router"
import * as Cause from "effect/Cause"
import * as Exit from "effect/Exit"
import * as Result from "effect/reactivity/AsyncResult"
import * as Schema from "effect/Schema"
import { ChevronDown, FolderKanban } from "lucide-react"
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

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogTitle
} from "@/components/ui/dialog"
import { Select, SelectTrigger } from "@/components/ui/select"
import {
  project as projectView,
  projectRequest,
  projectsFor,
  projectsRequest
} from "@/features/projects/atoms/projects"
import { ProjectContext } from "@/features/projects/hooks/useProject"
import {
  assignTicketToSprint,
  sprintListRequest
} from "@/features/sprints/atoms/sprintList"
import {
  createTicketDialog,
  createTicketInProject,
  type CreateTicketDialogRequest
} from "@/features/tickets/atoms/createTicketDialog"
import { AssigneeSelect } from "@/features/tickets/components/ticket-list/AssigneeField"
import { EstimateBadgeTrigger } from "@/features/tickets/components/ticket-list/EstimateField"
import { PrioritySelect } from "@/features/tickets/components/ticket-list/PriorityField"
import { SprintSelect } from "@/features/tickets/components/ticket-list/SprintField"
import { StatusSelect } from "@/features/tickets/components/ticket-list/StatusField"
import { TypeSelect } from "@/features/tickets/components/ticket-list/TypeField"
import { useTemplateChoice } from "@/features/tickets/components/ticket-list/useTemplateChoice"
import { errorMessage } from "@/lib/errorMessage"
import { m } from "@/paraglide/messages"

const DEFAULT_STATUS = Schema.decodeSync(TicketStatusSchema)("todo")

export function CreateTicketDialogHost() {
  const [request, setRequest] = useAtom(createTicketDialog)
  const [shown, setShown] = useState(request)
  if (request !== null && request !== shown) setShown(request)
  const pathname = useRouterState({
    select: (state) => state.location.pathname
  })
  const openedAt = useRef<string | null>(null)
  useEffect(() => {
    if (request === null) {
      openedAt.current = null
      return
    }
    if (openedAt.current === null) {
      openedAt.current = pathname
      return
    }
    if (openedAt.current !== pathname) setRequest(null)
  }, [request, pathname, setRequest])
  return (
    <Dialog
      open={request !== null}
      onOpenChange={(open) => {
        if (!open) setRequest(null)
      }}
    >
      <DialogContent size="lg" showCloseButton={false} className="p-0">
        {shown !== null && (
          <CreateTicketForm
            key={`${shown.orgSlug}:${shown.projectSlug ?? ""}`}
            request={shown}
            onDone={() => setRequest(null)}
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
  const project = projects.find((entry) => entry.slug === slug)

  const titleInput = useRef<HTMLInputElement>(null)
  useEffect(() => titleInput.current?.focus(), [])
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [type, setType] = useState<TicketType>("other")
  const [priority, setPriority] = useState<TicketPriority>("med")
  const [status, setStatus] = useState<TicketStatus | null>(null)
  const [assignees, setAssignees] = useState<ReadonlyArray<string>>([])
  const [estimate, setEstimate] = useState<Estimate | null>(null)
  const [sprint, setSprint] = useState<GroupId | null>(null)
  const registry = useContext(RegistryContext)
  const [failure, setFailure] = useState<string | null>(null)
  const templateChoice = useTemplateChoice(orgSlug, slug ?? "", type)
  const create = useAtomSet(createTicketInProject, { mode: "promiseExit" })
  const state = useAtomValue(createTicketInProject)
  const trimmed = title.trim()
  const body = description.trim()
  const canSubmit = slug !== null && trimmed !== "" && !state.waiting

  const submit = async (event?: FormEvent) => {
    event?.preventDefault()
    if (!canSubmit) return
    setFailure(null)
    const exit = await create({
      orgSlug,
      slug,
      payload: {
        title: trimmed,
        type,
        priority,
        status: status ?? undefined,
        assignees: assignees.length === 0 ? undefined : assignees,
        estimate: estimate ?? undefined,
        ...(body === "" ? templateChoice.payload : { body })
      }
    })
    if (Exit.isFailure(exit)) {
      setFailure(errorMessage(Cause.squash(exit.cause)))
      return
    }
    if (sprint !== null && type !== "epic") {
      assignTicketToSprint(
        registry,
        sprintListRequest(orgSlug, slug),
        exit.value.id,
        sprint
      )
    }
    onDone()
    void navigate({
      to: "/orgs/$orgSlug/projects/$slug/tickets/$id",
      params: { orgSlug, slug, id: exit.value.id },
      search: body === "" ? { focusBody: 1 } : {}
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
      <div className="flex items-center gap-2 pt-4 pr-4 pl-1.5">
        <Select
          items={projects.map((entry) => ({
            value: entry.slug,
            textValue: entry.name,
            label: entry.name
          }))}
          value={slug}
          onValueChange={(next) => {
            setPicked(next)
            setStatus(null)
            setAssignees([])
            setEstimate(null)
            setSprint(null)
          }}
          contentProps={{ align: "start", className: "w-56" }}
        >
          <SelectTrigger render={<Button type="button" variant="chip" />}>
            <FolderKanban className="size-3.5" strokeWidth={1.75} />
            <span>{project?.name ?? m.tickets_create_dialog_project()}</span>
            <ChevronDown className="size-3" strokeWidth={1.75} />
          </SelectTrigger>
        </Select>
        <DialogTitle className="text-[13px] font-normal text-muted-foreground">
          {m.tickets_create_dialog_title()}
        </DialogTitle>
      </div>
      <input
        aria-label={m.tickets_create_title_aria_label()}
        placeholder={m.tickets_create_dialog_title_placeholder()}
        value={title}
        maxLength={200}
        onKeyDown={onSubmitShortcut}
        onChange={(event) => {
          setTitle(event.target.value)
          setFailure(null)
        }}
        className="mt-3 w-full bg-transparent px-4 text-lg font-medium tracking-tight outline-none placeholder:text-muted-foreground/70"
        ref={titleInput}
      />
      <textarea
        aria-label={m.tickets_create_dialog_description_label()}
        placeholder={m.tickets_create_dialog_description_placeholder()}
        value={description}
        onKeyDown={onSubmitShortcut}
        onChange={(event) => setDescription(event.target.value)}
        rows={4}
        className="mt-1 w-full resize-none bg-transparent px-4 text-sm text-(--prose-body) outline-none placeholder:text-muted-foreground/70"
      />
      <div className="flex flex-wrap items-center gap-1.5 pt-2 pr-4 pl-1.5">
        {slug === null ? (
          <TypeSelect value={type} onChange={setType} />
        ) : (
          <ProjectScope orgSlug={orgSlug} slug={slug}>
            <CreateTicketChips
              key={slug}
              orgSlug={orgSlug}
              slug={slug}
              status={status}
              onStatus={setStatus}
              type={type}
              onType={setType}
              priority={priority}
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
      </div>
      {failure !== null && (
        <p
          role="alert"
          className="mx-4 mt-3 rounded-lg bg-destructive-light px-3 py-2 text-[13px] text-destructive"
        >
          {failure}
        </p>
      )}
      <DialogFooter className="border-t border-border/60 px-4 py-3">
        <DialogClose
          render={<Button type="button" variant="ghost" size="sm" />}
        >
          {m.common_cancel_button()}
        </DialogClose>
        <Button type="submit" size="sm" disabled={!canSubmit}>
          {m.tickets_create_dialog_submit()}
        </Button>
      </DialogFooter>
    </form>
  )
}

function CreateTicketChips({
  orgSlug,
  slug,
  status,
  onStatus,
  type,
  onType,
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
  type: TicketType
  onType: (type: TicketType) => void
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
      <TypeSelect value={type} onChange={onType} />
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
      {type !== "epic" && <SprintSelect value={sprint} onChange={onSprint} />}
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
