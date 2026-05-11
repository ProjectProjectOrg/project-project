import { createFileRoute, Outlet } from "@tanstack/react-router"

export const Route = createFileRoute("/(public)/spike")({
  component: SpikeLayout
})

function SpikeLayout() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="flex items-center gap-4 border-b border-border px-4 py-3">
        <span className="text-sm font-semibold">Kanban spike</span>
        <span className="ml-auto text-xs text-muted-foreground">
          Drag a card to feel the insertion line. FPS counter bottom-right, card slider next to it.
        </span>
      </header>
      <Outlet />
    </div>
  )
}
