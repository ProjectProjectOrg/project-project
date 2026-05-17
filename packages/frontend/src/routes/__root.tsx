import { createRootRouteWithContext, Outlet } from "@tanstack/react-router"
import type { Registry } from "@effect-atom/atom-react"
import { ShapeProvider } from "@/lib/shape-context"

export interface RouterContext {
  registry: Registry.Registry
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootComponent
})

function RootComponent() {
  return (
    <ShapeProvider>
      <Outlet />
    </ShapeProvider>
  )
}
