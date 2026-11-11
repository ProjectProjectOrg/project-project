import { cn } from "@/lib/utils"

export function MetaRow({
  label,
  controls = false,
  children
}: {
  label: string
  controls?: boolean
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-2 has-[>div:empty]:hidden">
      <span className="text-caption text-muted-foreground">{label}</span>
      <div className={cn("min-w-0", controls && "-my-1.5 -ml-2.5")}>
        {children}
      </div>
    </div>
  )
}
