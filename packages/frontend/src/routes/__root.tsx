import { createRootRoute, Outlet } from "@tanstack/react-router"
import { ShapeProvider } from "@/lib/shape-context"

export const Route = createRootRoute({ component: RootComponent })

function RootComponent() {
  return (
    <ShapeProvider>
      <Outlet />
    </ShapeProvider>
  )
}
