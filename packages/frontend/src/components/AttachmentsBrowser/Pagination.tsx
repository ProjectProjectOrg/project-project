import { ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"
import { pageCount, pageRange, pageWindow } from "./paging"

const WINDOW_SPAN = 7

export function Pagination({
  page,
  pageSize,
  total,
  onPageChange
}: {
  page: number
  pageSize: number
  total: number
  onPageChange: (page: number) => void
}) {
  const pages = pageCount(total, pageSize)
  const { from, to } = pageRange({ page, pageSize, total })

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 pt-3">
      <span className="text-xs text-muted-foreground">
        {m.attachments_page_range({ from, to, total })}
      </span>

      {pages > 1 ? (
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
            aria-label={m.attachments_page_prev()}
          >
            <ChevronLeft className="size-4" strokeWidth={1.75} />
          </Button>

          {pageWindow({ page, pages, span: WINDOW_SPAN }).map((slot, index) =>
            slot === "gap" ? (
              <span
                key={`gap-${index}`}
                aria-hidden
                className="px-1 text-xs text-muted-foreground"
              >
                …
              </span>
            ) : (
              <Button
                key={slot}
                type="button"
                variant="ghost"
                size="sm"
                aria-label={m.attachments_page_of({ page: slot })}
                aria-current={slot === page ? "page" : undefined}
                onClick={() => onPageChange(slot)}
                className={cn(
                  "min-w-8 tabular-nums",
                  slot === page && "bg-accent font-medium text-foreground"
                )}
              >
                {slot}
              </Button>
            )
          )}

          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            disabled={page >= pages}
            onClick={() => onPageChange(page + 1)}
            aria-label={m.attachments_page_next()}
          >
            <ChevronRight className="size-4" strokeWidth={1.75} />
          </Button>
        </div>
      ) : null}
    </div>
  )
}
