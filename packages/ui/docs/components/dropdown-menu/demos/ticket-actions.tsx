import { Button } from "@pp/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuEmpty,
  DropdownMenuInput,
  DropdownMenuItem,
  DropdownMenuList,
  DropdownMenuRadioGroup,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger
} from "@pp/ui/dropdown-menu"
import {
  Archive,
  Check,
  Circle,
  CircleDashed,
  CircleDot,
  Copy,
  FileText,
  FolderInput,
  Hash,
  Link2,
  MoreHorizontal,
  SignalHigh,
  SignalLow,
  SignalMedium,
  Trash2,
  UserRound
} from "lucide-react"
import { useState } from "react"

const USER_TOGGLES = new Set(["trigger-press", "escape-key"])

const STATUSES = [
  {
    value: "backlog",
    label: "Backlog",
    icon: CircleDashed,
    tone: "text-muted-foreground"
  },
  { value: "todo", label: "Todo", icon: Circle, tone: "text-muted-foreground" },
  {
    value: "in-progress",
    label: "In progress",
    icon: CircleDot,
    tone: "text-state-info"
  },
  { value: "done", label: "Done", icon: Check, tone: "text-state-success" }
] as const

const PRIORITIES = [
  { value: "low", label: "Low", icon: SignalLow },
  { value: "medium", label: "Medium", icon: SignalMedium },
  { value: "high", label: "High", icon: SignalHigh }
] as const

const PEOPLE = ["Wouter", "Anna", "Sam", "Noor"] as const

export default function TicketActions() {
  const [open, setOpen] = useState(true)
  const [status, setStatus] =
    useState<(typeof STATUSES)[number]["value"]>("in-progress")
  const [priority, setPriority] =
    useState<(typeof PRIORITIES)[number]["value"]>("medium")
  const [assignees, setAssignees] = useState<ReadonlySet<string>>(
    () => new Set(["Wouter"])
  )

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(next, details) => {
        if (USER_TOGGLES.has(details.reason)) setOpen(next)
      }}
      modal={false}
    >
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="icon-sm" aria-label="Ticket actions" />
        }
      >
        <MoreHorizontal strokeWidth={1.75} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={6} className="w-52">
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <CircleDot className="size-4" strokeWidth={1.75} />
            Change status
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-48">
            <DropdownMenuRadioGroup
              value={status}
              onValueChange={setStatus}
              items={STATUSES.map(({ value, label, icon: Icon, tone }) => ({
                value,
                textValue: label,
                label: (
                  <>
                    <Icon className={`size-4 ${tone}`} strokeWidth={1.75} />
                    {label}
                  </>
                )
              }))}
            />
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <SignalHigh className="size-4" strokeWidth={1.75} />
            Set priority
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-40">
            <DropdownMenuRadioGroup
              value={priority}
              onValueChange={setPriority}
              items={PRIORITIES.map(({ value, label, icon: Icon }) => ({
                value,
                textValue: label,
                label: (
                  <>
                    <Icon className="size-4" strokeWidth={1.75} />
                    {label}
                  </>
                )
              }))}
            />
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSub filterable>
          <DropdownMenuSubTrigger>
            <UserRound className="size-4" strokeWidth={1.75} />
            Assign to
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-56">
            <DropdownMenuInput
              placeholder="Search people…"
              aria-label="Search people…"
            />
            <DropdownMenuList className="max-h-72 overflow-y-auto">
              {PEOPLE.map((person) => (
                <DropdownMenuCheckboxItem
                  key={person}
                  label={person}
                  closeOnClick={false}
                  checked={assignees.has(person)}
                  onCheckedChange={() =>
                    setAssignees((current) => {
                      const next = new Set(current)
                      if (!next.delete(person)) next.add(person)
                      return next
                    })
                  }
                >
                  <span
                    aria-hidden
                    className="grid size-4 place-items-center rounded-full bg-muted text-micro"
                  >
                    {person[0]}
                  </span>
                  {person}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuList>
            <DropdownMenuEmpty>No one matches</DropdownMenuEmpty>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <FolderInput className="size-4" strokeWidth={1.75} />
            Move to
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-40">
            <DropdownMenuItem>Project</DropdownMenuItem>
            <DropdownMenuItem>Sprint</DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Copy className="size-4" strokeWidth={1.75} />
            Copy
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-48">
            <DropdownMenuItem>
              <Hash className="size-4" strokeWidth={1.75} />
              Copy ID
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Link2 className="size-4" strokeWidth={1.75} />
              Copy URL
            </DropdownMenuItem>
            <DropdownMenuItem>
              <FileText className="size-4" strokeWidth={1.75} />
              Copy as Markdown
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem>
          <Archive className="size-4" strokeWidth={1.75} />
          Archive
        </DropdownMenuItem>
        <DropdownMenuItem variant="destructive">
          <Trash2 className="size-4" strokeWidth={1.75} />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
