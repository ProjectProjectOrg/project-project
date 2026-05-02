// packages/frontend/src/routes/__root.tsx
//
// The root route. Every page in TanStack Router's file-based routing nests
// under this one. For Chapter 0, this layout only needs to render an
// <Outlet /> (the slot where matched child routes render).
//
// Later chapters will wrap this with:
//   - global navigation chrome
//   - a router devtools panel (in dev only)
//   - the auth gate, which actually lives in a sibling `_authed.tsx` so the
//     login route can opt out
//
// CHAPTER 0 STEPS
// ----------------------------------------------------------------------------
//   1. Import `createRootRoute` and `Outlet` from "@tanstack/react-router".
//   2. Export `Route = createRootRoute({ component: RootComponent })`.
//   3. RootComponent renders <Outlet />.
//
// You can keep the JSX trivial — no styling, no header. We are testing the
// vertical slice (frontend → backend → response) end to end.

import { createRootRoute, Outlet } from "@tanstack/react-router"

export const Route = createRootRoute({ component: RootComponent })

function RootComponent() {
  return <Outlet />
}
