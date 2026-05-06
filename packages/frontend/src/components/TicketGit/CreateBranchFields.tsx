import { Result, useAtomSet, useAtomValue } from "@effect-atom/atom-react"
import {
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronsUpDown,
  GitBranch
} from "lucide-react"
import { useEffect, useState } from "react"
import { branchesAtom, branchesKey, createBranchAtom } from "@/atoms/github"
import { projectKey } from "@/atoms/projects"
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
import { slugify } from "@/lib/slug"
import { STATUS_META } from "@/lib/ticket-meta"
import type {
  GithubConnection,
  TicketDetail,
  TicketStatus
} from "@projectproject/shared"

const STATUS_KEYS = Object.keys(STATUS_META) as ReadonlyArray<TicketStatus>
const STATUS_SEGMENTED_THRESHOLD = 4

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
  orgSlug,
  slug,
  ticket,
  github,
  branchTemplate
}: {
  orgSlug: string
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
  const [status, setStatus] = useState<TicketStatus>("in_progress")
  const [error, setError] = useState<string | null>(null)
  const create = useAtomSet(createBranchAtom(projectKey(orgSlug, slug)))
  const updateTicket = useAtomSet(updateTicketAtom)

  async function submit() {
    if (!name.trim()) return
    setError(null)
    setBusy(true)
    try {
      await Promise.all([
        create({
          id: ticket.id,
          name: name.trim(),
          baseBranch: base.trim() || undefined
        }),
        status !== ticket.status
          ? updateTicket({ orgSlug, slug, id: ticket.id, status })
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
            orgSlug={orgSlug}
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

function StatusPicker({
  value,
  onChange,
  disabled
}: {
  value: TicketStatus
  onChange: (next: TicketStatus) => void
  disabled?: boolean
}) {
  const segmented = STATUS_KEYS.length <= STATUS_SEGMENTED_THRESHOLD
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

function StatusInlinePills({
  value,
  onChange,
  disabled
}: {
  value: TicketStatus
  onChange: (next: TicketStatus) => void
  disabled?: boolean
}) {
  const items: ReadonlyArray<SegmentedItem<TicketStatus>> = STATUS_KEYS.map(
    (key) => ({
      key,
      label: STATUS_META[key].label,
      icon: STATUS_META[key].icon,
      iconClassName: STATUS_META[key].className
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
  const current = STATUS_META[value] ?? STATUS_META.todo
  const Icon = current.icon
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-label={`Status: ${current.label}. Click to change.`}
          className={cn(
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
        {STATUS_KEYS.map((key) => {
          const meta = STATUS_META[key]
          const SIcon = meta.icon
          return (
            <DropdownMenuItem
              key={key}
              onSelect={() => onChange(key)}
              className="cursor-pointer"
            >
              <SIcon
                className={cn("size-4", meta.className)}
                strokeWidth={1.75}
              />
              {meta.label}
              {value === key && (
                <Check className="ml-auto size-3.5 text-muted-foreground" />
              )}
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function BaseBranchCombobox({
  orgSlug,
  slug,
  value,
  onChange,
  placeholder,
  disabled
}: {
  orgSlug: string
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

  const result = useAtomValue(branchesAtom(branchesKey(orgSlug, slug, q)))
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
