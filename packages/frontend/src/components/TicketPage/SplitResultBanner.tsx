import { Link, useNavigate } from "@tanstack/react-router"
import { Split, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { m } from "@/paraglide/messages"
import type { TicketId } from "@projectproject/shared"

export function SplitResultBanner({
  orgSlug,
  slug,
  created
}: {
  orgSlug: string
  slug: string
  created: ReadonlyArray<TicketId>
}) {
  const navigate = useNavigate()

  return (
    <section className="flex items-start gap-2.5 rounded-xl border border-state-success/30 bg-state-success/5 px-4 py-3">
      <Split
        className="mt-0.5 size-4 shrink-0 text-state-success"
        strokeWidth={1.75}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <p className="text-[13px]">
          {m.tickets_split_result_banner({ count: created.length })}
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
          {created.map((id) => (
            <Link
              key={id}
              to="/orgs/$orgSlug/projects/$slug/tickets/$id"
              params={{ orgSlug, slug, id }}
              className="rounded-md bg-foreground/5 px-2 py-0.5 font-mono text-[11px] tabular-nums transition-colors hover:bg-foreground/10"
            >
              {id}
            </Link>
          ))}
        </div>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={m.tickets_split_result_dismiss()}
        onClick={() =>
          void navigate({
            to: ".",
            search: (prev) => ({ ...prev, splitInto: undefined }),
            replace: true
          })
        }
        className="shrink-0"
      >
        <X strokeWidth={1.75} />
      </Button>
    </section>
  )
}
