import { Result, useAtomValue } from "@effect-atom/atom-react"
import { createFileRoute } from "@tanstack/react-router"
import { meAtom } from "@/atoms/auth"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card"
import { PageContainer, PageHeader } from "@/components/page"

export const Route = createFileRoute("/_authed/")({ component: Dashboard })

function Dashboard() {
  const me = useAtomValue(meAtom)
  const name = Result.isSuccess(me) ? me.value.name.split(" ")[0] : "there"

  return (
    <PageContainer>
      <PageHeader>
        <h1>Welcome back, {name}.</h1>
        <p>
          Markdown-first project management. Pick a project from the sidebar,
          or create a new one.
        </p>
      </PageHeader>

      <Card>
        <CardHeader>
          <CardTitle>Nothing here yet</CardTitle>
          <CardDescription>
            Project and ticket views will land in the next slice.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Right now this is the auth-gated home — the gate, sidebar, and topbar
          are working, and you're signed in.
        </CardContent>
      </Card>
    </PageContainer>
  )
}
