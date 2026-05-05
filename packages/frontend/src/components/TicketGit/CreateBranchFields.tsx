// Inline form body for "create branch". Mounted by InlineForm.Form action="create".
// Owns its own submit/error state; uses useInlineForm() for busy/close.

import { useAtomSet } from "@effect-atom/atom-react"
import { CheckCircle2 } from "lucide-react"
import { useState } from "react"
import { createBranchAtom } from "@/atoms/github"
import { Button } from "@/components/ui/button"
import { InlineForm, useInlineForm } from "@/components/ui/inline-form"
import { Input } from "@/components/ui/input"
import type { GithubConnection, TicketDetail } from "@projectproject/shared"

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30)
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
      <div className="grid gap-2 sm:grid-cols-[1fr_180px]">
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
          <Input
            value={base}
            onChange={(e) => setBase(e.target.value)}
            className="mt-0.5 h-8 font-mono"
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
