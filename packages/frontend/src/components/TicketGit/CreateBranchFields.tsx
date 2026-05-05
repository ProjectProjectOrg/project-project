// Inline form body for "create branch". Mounted by InlineForm.Form action="create".
// Owns its own submit/error state; uses useInlineForm() for busy/close.

import { Result, useAtomSet, useAtomValue } from "@effect-atom/atom-react"
import {
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronsUpDown,
  CircleDashed,
  CircleDot,
  GitBranch
} from "lucide-react"
import type { ComponentType } from "react"
import { useEffect, useState } from "react"
import { branchesAtom, branchesKey, createBranchAtom } from "@/atoms/github"
import { updateTicketAtom } from "@/atoms/tickets"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList
} from "@/components/ui/command"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import { InlineForm, useInlineForm } from "@/components/ui/inline-form"
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from "@/components/ui/popover"
import {
  SEGMENTED_ITEM_CLASS,
  SegmentedTabs,
  type SegmentedItem
} from "@/components/SegmentedTabs"
import { cn } from "@/lib/utils"
import type {
  GithubConnection,
  TicketDetail,
  TicketStatus
} from "@projectproject/shared"

// Status options the user can flip the ticket to when creating a branch.
// Source-of-truth duplicated from TicketList's STATUS_META — small enough that
// extracting a shared module isn't worth the import churn yet. When custom
// statuses arrive we'll likely move to a project-scoped atom anyway.
type StatusOption = {
  key: TicketStatus
  label: string
  icon: ComponentType<{ className?: string; strokeWidth?: number }>
  className: string
}
const STATUS_OPTIONS: ReadonlyArray<StatusOption> = [
  {
    key: "todo",
    label: "Todo",
    icon: CircleDashed,
    className: "text-muted-foreground"
  },
  {
    key: "in_progress",
    label: "In progress",
    icon: CircleDot,
    className: "text-blue-500"
  },
  { key: "done", label: "Done", icon: Check, className: "text-emerald-500" }
]

// Up to this many statuses fit comfortably as inline pills. Past that we
// switch to a dropdown so the row doesn't wrap and the create button stays
// reachable. Threshold is 4 because once custom statuses land 5+ becomes
// likely.
const STATUS_SEGMENTED_THRESHOLD = 4

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

function defaultBranchName(
  template: string | null,
  type: string,
  id: string,
  title: string
): string {
  const tpl = template ?? "{type}/{id}-{slug}"
  return tpl
    .replace("{type}", type)
    .replace("{id}", id)
    .replace("{slug}", slugify(title))
}

export function CreateBranchFields({
  slug,
  ticket,
  github,
  branchTemplate
}: {
  slug: string
  ticket: TicketDetail
  github: GithubConnection
  branchTemplate: string | null
}) {
  const { busy, setBusy, close } = useInlineForm()
  const [name, setName] = useState(() =>
    defaultBranchName(branchTemplate, ticket.type, ticket.id, ticket.title)
  )
  const [base, setBase] = useState(github.defaultBaseBranch ?? "")
  // Default new-branch flow to "in progress" — that's why the user is making a
  // branch. They can flip to anything else before submitting.
  const [status, setStatus] = useState<TicketStatus>("in_progress")
  const [error, setError] = useState<string | null>(null)
  const create = useAtomSet(createBranchAtom(slug))
  const updateTicket = useAtomSet(updateTicketAtom)

  async function submit() {
    if (!name.trim()) return
    setError(null)
    setBusy(true)
    try {
      // Fire status update + branch creation in parallel. Each refreshes its
      // own bases independently. If status is unchanged we skip the call.
      await Promise.all([
        create({
          id: ticket.id,
          name: name.trim(),
          baseBranch: base.trim() || undefined
        }),
        status !== ticket.status
          ? updateTicket({ slug, id: ticket.id, status })
          : Promise.resolve()
      ])
      close()
    } catch (e) {
      const tag =
        typeof e === "object" && e && "_tag" in e ? String(e._tag) : ""
      setError(
        tag === "BranchExists"
          ? `Branch "${name.trim()}" already exists.`
          : tag === "BranchProtected"
            ? "Branch name is protected."
            : tag === "GitHubTokenExpired"
              ? "GitHub token expired."
              : tag === "GitHubScopeInsufficient"
                ? "GitHub scope insufficient."
                : tag === "RepoGone"
                  ? "Repo not accessible."
                  : "Couldn't create branch."
      )
      setBusy(false)
    }
  }

  return (
    <>
      <div className="grid gap-2 sm:grid-cols-[1fr_220px]">
        <label className="block text-xs">
          <span className="text-muted-foreground">Branch name</span>
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-0.5 font-mono"
            placeholder="feat/T-12-add-button"
            disabled={busy}
          />
        </label>
        <label className="block text-xs">
          <span className="text-muted-foreground">Base branch</span>
          <BaseBranchCombobox
            slug={slug}
            value={base}
            onChange={setBase}
            placeholder={github.defaultBaseBranch ?? "main"}
            disabled={busy}
          />
        </label>
      </div>
      {error && (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <StatusPicker value={status} onChange={setStatus} disabled={busy} />
        <div className="flex gap-2">
          <InlineForm.Cancel />
          <Button
            size="sm"
            leadingIcon={CheckCircle2}
            onClick={() => void submit()}
            disabled={busy || !name.trim()}
          >
            {busy ? "Creating…" : "Create branch"}
          </Button>
        </div>
      </div>
    </>
  )
}

// Status switch shown in the create-branch action row. The leading "Update
// status to:" label tells the user what the pills do — without it the picker
// reads as ambient state rather than an action. Renders as inline pills while
// there are few enough statuses to fit; flips to a labeled dropdown once the
// count crosses STATUS_SEGMENTED_THRESHOLD.
function StatusPicker({
  value,
  onChange,
  disabled
}: {
  value: TicketStatus
  onChange: (next: TicketStatus) => void
  disabled?: boolean
}) {
  const segmented = STATUS_OPTIONS.length <= STATUS_SEGMENTED_THRESHOLD
  return (
    <div className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <span>Update status to:</span>
      {segmented ? (
        <StatusInlinePills
          value={value}
          onChange={onChange}
          disabled={disabled}
        />
      ) : (
        <StatusDropdown
          value={value}
          onChange={onChange}
          disabled={disabled}
        />
      )}
    </div>
  )
}

// Compact inline pills — chrome-less, reads as part of the surrounding
// "Update status to:" sentence. Uses the shared SegmentedTabs primitive's
// `inline` variant rather than rolling local styles.
function StatusInlinePills({
  value,
  onChange,
  disabled
}: {
  value: TicketStatus
  onChange: (next: TicketStatus) => void
  disabled?: boolean
}) {
  const items: ReadonlyArray<SegmentedItem<TicketStatus>> = STATUS_OPTIONS.map(
    (s) => ({
      key: s.key,
      label: s.label,
      icon: s.icon,
      iconClassName: s.className
    })
  )
  return (
    <SegmentedTabs
      items={items}
      layoutId="create-branch-status"
      variant="inline"
      isActive={(k) => k === value}
      renderItem={(item, content, { active }) => (
        <button
          type="button"
          onClick={() => onChange(item.key)}
          disabled={disabled}
          aria-pressed={active}
          className={cn(
            SEGMENTED_ITEM_CLASS(active, "inline"),
            "disabled:cursor-not-allowed disabled:opacity-50"
          )}
        >
          {content}
        </button>
      )}
    />
  )
}

function StatusDropdown({
  value,
  onChange,
  disabled
}: {
  value: TicketStatus
  onChange: (next: TicketStatus) => void
  disabled?: boolean
}) {
  const current = STATUS_OPTIONS.find((s) => s.key === value) ?? STATUS_OPTIONS[0]
  const Icon = current.icon
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-label={`Status: ${current.label}. Click to change.`}
          className={cn(
            // Compact to match the inline-pills scale — reads as part of the
            // "Update status to:" sentence rather than a separate control.
            "inline-flex h-6 items-center gap-1 rounded-md px-1.5 text-xs",
            "text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground",
            "disabled:cursor-not-allowed disabled:opacity-50"
          )}
        >
          <Icon
            className={cn("size-3", current.className)}
            strokeWidth={1.75}
          />
          <span>{current.label}</span>
          <ChevronDown className="size-3 opacity-60" strokeWidth={1.75} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={6} className="w-44">
        {STATUS_OPTIONS.map((s) => {
          const SIcon = s.icon
          return (
            <DropdownMenuItem
              key={s.key}
              onSelect={() => onChange(s.key)}
              className="cursor-pointer"
            >
              <SIcon
                className={cn("size-4", s.className)}
                strokeWidth={1.75}
              />
              {s.label}
              {value === s.key && (
                <Check className="ml-auto size-3.5 text-muted-foreground" />
              )}
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// Server-driven combobox: cmdk's built-in filter is disabled (`shouldFilter={false}`);
// the search input feeds `q` into branchesAtom which calls GitHub's GraphQL
// refs(query:) for fuzzy match. 200ms debounce mirrors ConnectBranchFields.
function BaseBranchCombobox({
  slug,
  value,
  onChange,
  placeholder,
  disabled
}: {
  slug: string
  value: string
  onChange: (next: string) => void
  placeholder: string
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [q, setQ] = useState("")

  useEffect(() => {
    const t = setTimeout(() => setQ(search), 200)
    return () => clearTimeout(t)
  }, [search])

  const result = useAtomValue(branchesAtom(branchesKey(slug, q)))
  const items = Result.isSuccess(result) ? result.value.items : []
  const loading = Result.isInitial(result) || Result.isWaiting(result)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            // Match the sibling Input's chrome — rounded-xl + h-9 + px-3.
            // The combobox previously sat at rounded-md/h-8, which read as a
            // mismatched control next to the branch-name input.
            "mt-0.5 flex h-9 w-full items-center justify-between rounded-xl border border-border bg-background px-3 font-mono text-xs",
            "ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            "disabled:cursor-not-allowed disabled:opacity-50",
            !value && "text-muted-foreground"
          )}
        >
          <span className="truncate">{value || placeholder}</span>
          <ChevronsUpDown className="size-3 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[--radix-popover-trigger-width] p-0"
      >
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search branches…"
            value={search}
            onValueChange={setSearch}
            className="h-8"
          />
          <CommandList>
            {loading ? (
              <CommandEmpty>Loading…</CommandEmpty>
            ) : items.length === 0 ? (
              <CommandEmpty>No branches found.</CommandEmpty>
            ) : (
              <CommandGroup>
                {items.map((b) => (
                  <CommandItem
                    key={b.name}
                    value={b.name}
                    onSelect={(picked) => {
                      onChange(picked)
                      setOpen(false)
                    }}
                    className="font-mono text-xs"
                  >
                    <Check
                      className={cn(
                        "size-3",
                        value === b.name ? "opacity-100" : "opacity-0"
                      )}
                    />
                    <GitBranch className="size-3" strokeWidth={1.75} />
                    <span className="truncate">{b.name}</span>
                    {b.isProtected && (
                      <span className="ml-auto text-[10px] uppercase tracking-wide text-muted-foreground">
                        protected
                      </span>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
