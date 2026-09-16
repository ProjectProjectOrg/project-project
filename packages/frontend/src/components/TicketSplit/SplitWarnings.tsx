import type { ReactNode } from "react"
import { GitBranch, MessageSquare } from "lucide-react"
import { m } from "@/paraglide/messages"
import type { TicketDetail } from "@projectproject/shared"

function Line({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <p className="flex items-start gap-2 text-[13px] leading-[18px]">
      <span className="mt-px shrink-0 text-state-warning">{icon}</span>
      <span>{children}</span>
    </p>
  )
}

export function SplitWarnings({
  ticket,
  commentCount,
  resultCount,
  error
}: {
  ticket: TicketDetail
  commentCount: number
  resultCount: number
  error: string | null
}) {
  return (
    <div className="flex flex-col gap-2.5">
      {ticket.branch !== null && (
        <Line icon={<GitBranch className="size-3.5" strokeWidth={1.75} />}>
          {m.tickets_split_warning_branch_prefix()}{" "}
          <span className="font-mono text-xs">{ticket.branch}</span>{" "}
          {ticket.pr === null
            ? m.tickets_split_warning_branch_suffix({ count: resultCount })
            : m.tickets_split_warning_branch_pr_suffix({
                number: ticket.pr,
                count: resultCount
              })}
        </Line>
      )}
      {commentCount > 0 && (
        <Line icon={<MessageSquare className="size-3.5" strokeWidth={1.75} />}>
          {m.tickets_split_warning_comments({
            count: commentCount,
            id: ticket.id
          })}
        </Line>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
