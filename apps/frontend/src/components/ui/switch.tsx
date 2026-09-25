import { Switch as SwitchPrimitive } from "@base-ui/react/switch"
import type * as React from "react"

import { cn } from "@/lib/utils"

function Switch({
  className,
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full bg-input p-0.5 transition-colors duration-150 outline-none focus-visible:ring-1 focus-visible:ring-ring data-[checked]:bg-foreground data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="size-4 rounded-full bg-background shadow-sm transition-transform duration-150 data-[checked]:translate-x-4" />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
