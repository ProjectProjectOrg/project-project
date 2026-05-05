// Inline form body for "create branch". Mounted by InlineForm.Form action="create".
// Owns its own submit/error state; uses useInlineForm() for busy/close.

import { Result, useAtomSet, useAtomValue } from "@effect-atom/atom-react"
import { Check, CheckCircle2, ChevronsUpDown, GitBranch } from "lucide-react"
import { useEffect, useState } from "react"
import { branchesAtom, branchesKey, createBranchAtom } from "@/atoms/github"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList
} from "@/components/ui/command"
import { InlineForm, useInlineForm } from "@/components/ui/inline-form"
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import type { GithubConnection, TicketDetail } from "@projectproject/shared"

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
  const [error, setError] = useState<string | null>(null)
  const create = useAtomSet(createBranchAtom)

  async function submit() {
    if (!name.trim()) return
    setError(null)
    setBusy(true)
    try {
      await create({
        slug,
        id: ticket.id,
        name: name.trim(),
        baseBranch: base.trim() || undefined
      })
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
            className="mt-0.5 h-8 font-mono"
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
      <div className="flex justify-end gap-2">
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
    </>
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
            "mt-0.5 flex h-8 w-full items-center justify-between rounded-md border border-input bg-transparent px-2 font-mono text-xs",
            "ring-offset-background focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
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
