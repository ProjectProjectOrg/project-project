import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox"
import type * as React from "react"

import { cn } from "@/lib/utils"

function Checkbox({
  className,
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "relative inline-flex size-4 shrink-0 cursor-pointer rounded-[3px] bg-background align-middle shadow-[inset_0_0_0_1px_var(--border)] transition-[background-color,box-shadow] duration-100 outline-none focus-visible:ring-1 focus-visible:ring-ring data-[checked]:bg-foreground data-[checked]:shadow-[inset_0_0_0_1px_var(--foreground)] data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50 data-[readonly]:cursor-default not-data-[readonly]:not-data-[disabled]:data-[unchecked]:hover:shadow-[inset_0_0_0_1px_var(--muted-foreground)]",
        className
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator className="absolute top-[14%] left-[36.5%] h-[52%] w-[28%] rotate-45 border-r-[1.5px] border-b-[1.5px] border-background" />
    </CheckboxPrimitive.Root>
  )
}

export { Checkbox }
