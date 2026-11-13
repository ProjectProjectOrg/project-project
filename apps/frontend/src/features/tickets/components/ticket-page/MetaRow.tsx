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
    <section className="flex flex-col gap-1.5 has-[>div:empty]:hidden">
      <h3 className="text-caption text-muted-foreground">{label}</h3>
      <div
        className={cn(
          "flex min-w-0 flex-col items-start",
          controls && "-ml-2.5 gap-1 [&_[data-slot=button]]:h-7"
        )}
      >
        {children}
      </div>
    </section>
  )
}
