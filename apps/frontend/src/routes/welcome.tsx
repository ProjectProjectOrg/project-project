import { createFileRoute } from "@tanstack/react-router"

import { WelcomePage } from "@/features/organizations/components/WelcomePage"

export const Route = createFileRoute("/welcome")({
  component: WelcomePage
})
