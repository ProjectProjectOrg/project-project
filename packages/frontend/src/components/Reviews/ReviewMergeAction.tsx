import { ChevronDown } from "lucide-react"
import { CollapsingLabel } from "@/components/SegmentedTabs"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"
import { mergeMethodLabel } from "@/components/Reviews/ReviewLabels"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"
import type { ReviewMergeMethod } from "@projectproject/shared"

export function ReviewMergeAction({
  canUseMerge,
  mergeAllowed,
  availableMethods,
  currentMethod,
  onSelectMethod,
  onMerge,
  loading,
  busy
}: {
  canUseMerge: boolean
  mergeAllowed: boolean
  availableMethods: ReadonlyArray<ReviewMergeMethod>
  currentMethod: ReviewMergeMethod
  onSelectMethod: (method: ReviewMergeMethod) => void
  onMerge: () => void
  loading: boolean
  busy: boolean
}) {
  const hasChevron = availableMethods.length > 1
  const disabled = !canUseMerge || !mergeAllowed
  const ready = canUseMerge && mergeAllowed
  const readyClass = ready
    ? "bg-state-success text-background hover:bg-state-success/90 active:bg-state-success/80"
    : ""
  return (
    <div className="inline-flex overflow-hidden rounded-md">
      <Button
        size="md"
        variant="primary"
        disabled={disabled}
        loading={loading}
        onClick={onMerge}
        className={cn(
          "text-sm font-medium",
          hasChevron && "rounded-r-none",
          readyClass
        )}
      >
        <CollapsingLabel show contentKey={currentMethod}>
          {mergeMethodLabel(currentMethod)}
        </CollapsingLabel>
      </Button>
      {hasChevron && (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                size="md"
                variant="primary"
                disabled={busy}
                className={cn(
                  "rounded-l-none border-l border-background/30 px-2",
                  readyClass
                )}
                aria-label={m.reviews_merge_method_select()}
              >
                <ChevronDown className="size-4" strokeWidth={1.75} />
              </Button>
            }
          />
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuRadioGroup
              value={currentMethod}
              onValueChange={(value) => {
                if (isReviewMergeMethod(value)) onSelectMethod(value)
              }}
            >
              {availableMethods.map((item) => (
                <DropdownMenuRadioItem key={item} value={item}>
                  {mergeMethodLabel(item)}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  )
}

function isReviewMergeMethod(value: string): value is ReviewMergeMethod {
  return value === "merge" || value === "squash" || value === "rebase"
}
