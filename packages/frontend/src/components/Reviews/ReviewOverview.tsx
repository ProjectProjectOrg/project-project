import { Check, Copy, MoreHorizontal } from "lucide-react"
import { useState } from "react"
import { Markdown } from "@/components/Markdown"
import { ReviewActions } from "@/components/Reviews/ReviewActions"
import {
  ReviewDetailsRows,
  ReviewLinkedTicket,
  ReviewPeopleSection
} from "@/components/Reviews/ReviewSidebar"
import { ReviewStatsStrip } from "@/components/Reviews/ReviewStatsStrip"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import { decisionLabel, roleLabel } from "@/components/Reviews/ReviewLabels"
import { m } from "@/paraglide/messages"
import type { ReviewPage as ReviewPageDto } from "@projectproject/shared"
export { diffPipTones } from "@/components/Reviews/ReviewIndicators"
export { checkSummaryLabel } from "@/components/Reviews/ReviewLabels"

export function ReviewOverview({
  orgSlug,
  slug,
  prNumber,
  review
}: {
  orgSlug: string
  slug: string
  prNumber: number
  review: ReviewPageDto
}) {
  const pr = review.pr
  return (
    <div className="flex flex-col gap-8">
      <div className="grid grid-cols-1 gap-x-6 gap-y-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <main className="flex min-w-0 flex-col gap-6">
          <ReviewStatsStrip review={review} orgSlug={orgSlug} slug={slug} />

          <section className="min-w-0">
            {pr.body.trim().length > 0 ? (
              <div className="flex min-w-0 items-start gap-2">
                <Markdown
                  htmlPolicy="skip"
                  className="min-w-0 max-w-none flex-1"
                >
                  {pr.body}
                </Markdown>
                <BodyActionsMenu body={pr.body} />
              </div>
            ) : (
              <div className="rounded-lg border border-border bg-background px-5 py-4 text-sm text-muted-foreground">
                {m.reviews_overview_empty_body()}
              </div>
            )}
          </section>

          <ReviewActions
            orgSlug={orgSlug}
            slug={slug}
            prNumber={prNumber}
            review={review}
          />
        </main>

        <aside className="flex flex-col gap-5 lg:sticky lg:top-6 lg:self-start lg:border-l lg:border-border/60 lg:pl-6">
          <ReviewLinkedTicket
            orgSlug={orgSlug}
            slug={slug}
            review={review}
            label={m.reviews_linked_ticket()}
          />
          <ReviewPeopleSection
            label={m.reviews_reviewers_title()}
            empty={m.reviews_reviewers_empty()}
            people={review.reviewers}
            renderMeta={(reviewer) => decisionLabel(reviewer.decision)}
          />
          <ReviewPeopleSection
            label={m.reviews_participants_title()}
            empty={m.reviews_participants_empty()}
            people={review.participants}
            renderMeta={(participant) => roleLabel(participant.role)}
          />
          <ReviewDetailsRows review={review} />
        </aside>
      </div>
    </div>
  )
}

function BodyActionsMenu({ body }: { body: string }) {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(body)
      setCopied(true)
      window.setTimeout(() => {
        setCopied(false)
        setOpen(false)
      }, 1000)
    } catch {}
  }

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setCopied(false)
      }}
    >
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            aria-label={m.reviews_body_actions_aria_label()}
            className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground outline-none transition-all duration-100 hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.97]"
          >
            <MoreHorizontal className="size-4" strokeWidth={1.75} />
          </button>
        }
      />
      <DropdownMenuContent align="end" sideOffset={6} className="w-48">
        <DropdownMenuItem
          closeOnClick={false}
          onClick={handleCopy}
          className="cursor-pointer"
        >
          {copied ? (
            <>
              <Check className="size-4 text-state-success" strokeWidth={2} />
              {m.reviews_action_copy_markdown_done()}
            </>
          ) : (
            <>
              <Copy className="size-4" strokeWidth={1.75} />
              {m.reviews_action_copy_markdown()}
            </>
          )}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
