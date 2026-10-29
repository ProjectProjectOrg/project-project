import { createFileRoute } from "@tanstack/react-router"

import { CliSignedInPage } from "@/features/oauth/components/CliSignInPage"

export const Route = createFileRoute("/(public)/cli/signed-in")({
  component: CliSignedInPage
})
