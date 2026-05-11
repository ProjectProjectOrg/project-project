import { createFileRoute, Navigate } from "@tanstack/react-router"

export const Route = createFileRoute("/(public)/spike/")({
  component: () => <Navigate to="/spike/pragmatic" />
})
