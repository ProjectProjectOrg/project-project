import { createFileRoute } from "@tanstack/react-router"

import { AuthedLayout } from "@/components/shell/AuthedLayout"

export const Route = createFileRoute("/_authed")({ component: AuthedLayout })
