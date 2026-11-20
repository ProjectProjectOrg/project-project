import { cn } from "@pp/ui/lib/utils"

import { pickerHeightClass } from "./ProjectPicker"

export function StepSkeleton() {
  return (
    <div className="flex flex-col gap-4 py-1">
      <div className="h-6 w-64 skeleton rounded-lg" />
      <div className="h-4 w-full max-w-lg skeleton rounded" />
      <div
        className={cn("mt-4 w-full skeleton rounded-xl", pickerHeightClass)}
      />
    </div>
  )
}
