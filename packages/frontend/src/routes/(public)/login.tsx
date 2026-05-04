import { Result, useAtomValue } from "@effect-atom/atom-react"
import { createFileRoute, Navigate } from "@tanstack/react-router"
import { meAtom } from "@/atoms/auth"
import { authClient } from "@/services/AuthClient"
import { Button } from "@/components/ui/button"

export const Route = createFileRoute("/(public)/login")({
  component: LoginPage
})

function LoginPage() {
  const me = useAtomValue(meAtom)

  if (Result.isSuccess(me)) return <Navigate to="/" />

  async function handleSignIn() {
    await authClient.signIn.social({
      provider: "github",
      callbackURL: "/"
    })
  }

  // No card chrome here — the auth page is its own surface, not a card on
  // top of a dashboard. Same logo treatment as the sidebar so the user
  // sees a continuous identity from sign-in through to first paint.
  return (
    <main className="grid min-h-screen place-items-center bg-muted p-6">
      <div className="flex w-full max-w-sm flex-col items-center gap-8 rounded-2xl border border-border bg-background p-8 shadow-sm">
        <div className="flex flex-col items-center gap-3">
          <div className="grid size-10 place-items-center rounded-xl bg-foreground text-background">
            <span className="text-base font-semibold">P</span>
          </div>
          <div className="text-center">
            <h1 className="text-lg font-semibold tracking-tight">
              ProjectProject
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Markdown-first project management.
            </p>
          </div>
        </div>

        <Button
          onClick={handleSignIn}
          leadingIcon={GithubMark}
          size="lg"
          className="w-full"
        >
          Continue with GitHub
        </Button>

        <p className="text-center text-[11px] leading-relaxed text-muted-foreground">
          By signing in you authorize this instance to read your GitHub profile
          and (later) create branches on connected repos.
        </p>
      </div>
    </main>
  )
}

// lucide-react v1 dropped brand icons, so we inline GitHub as an `IconComponent`-shaped SVG.
function GithubMark({
  size = 16,
  className
}: {
  size?: number
  strokeWidth?: number
  className?: string
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.92.58.1.79-.25.79-.56 0-.28-.01-1.02-.02-2-3.2.69-3.87-1.54-3.87-1.54-.52-1.33-1.28-1.69-1.28-1.69-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.7 0-1.26.45-2.29 1.18-3.1-.12-.29-.51-1.46.11-3.04 0 0 .97-.31 3.18 1.18a11 11 0 0 1 5.78 0c2.21-1.49 3.18-1.18 3.18-1.18.62 1.58.23 2.75.11 3.04.74.81 1.18 1.84 1.18 3.1 0 4.43-2.7 5.41-5.27 5.69.41.36.78 1.06.78 2.13 0 1.54-.01 2.78-.01 3.16 0 .31.21.67.8.56C20.22 21.39 23.5 17.08 23.5 12 23.5 5.65 18.35.5 12 .5Z" />
    </svg>
  )
}
