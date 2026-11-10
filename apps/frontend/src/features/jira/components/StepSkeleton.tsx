import { cn } from "@/lib/utils"

import { pickerHeightClass } from "./ProjectPicker"

export function StepSkeleton() {
  return (
    <div className="flex flex-col gap-4 py-1">
      <div className="skeleton h-6 w-64 rounded-lg" />
      <div className="skeleton h-4 w-full max-w-lg rounded" />
      <div
        className={cn("skeleton mt-4 w-full rounded-xl", pickerHeightClass)}
      />
    </div>
  )
}
