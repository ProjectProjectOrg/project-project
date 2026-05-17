import { createFileRoute } from "@tanstack/react-router"
import { Inbox } from "lucide-react"
import { DitherBackdrop } from "@/components/ui/button-dither"
import { m } from "@/paraglide/messages"

export const Route = createFileRoute("/_authed/welcome")({
  component: WelcomePage
})

function WelcomePage() {
  return (
    <div className="mx-auto flex min-h-[calc(100vh-8rem)] max-w-xl flex-col justify-center gap-6">
      <div className="relative h-28 overflow-hidden rounded-2xl border border-border bg-background">
        <DitherBackdrop
          from="var(--background)"
          to="var(--muted-foreground)"
          direction="tr"
          stops={[0.16, 0.92]}
          matrix="8x8"
          pixelSize={4}
        />
        <div className="absolute bottom-4 left-4 flex size-11 items-center justify-center rounded-xl bg-background shadow-sm ring-1 ring-border">
          <Inbox className="size-5 text-foreground" strokeWidth={1.75} />
        </div>
      </div>
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-normal text-foreground">
          {m.auth_welcome_title()}
        </h1>
        <p className="text-sm leading-6 text-muted-foreground">
          {m.auth_welcome_body()}
        </p>
      </div>
    </div>
  )
}
