import { useAtomValue } from "@effect/atom-react"
import * as Result from "effect/unstable/reactivity/AsyncResult"

import { ErrorPage } from "@/components/ErrorPage"
import { Button } from "@/components/ui/button"
import { m } from "@/paraglide/messages"

import { slackManifest, slackOrgRequest } from "../atoms/slack"

export function SlackAppSetup({ orgSlug }: Readonly<{ orgSlug: string }>) {
  const result = useAtomValue(slackManifest(slackOrgRequest(orgSlug)))
  return Result.matchWithError(result, {
    onInitial: () => <div className="h-24 animate-pulse rounded-lg bg-muted" />,
    onError: (error) => <ErrorPage contained error={error} />,
    onDefect: (error) => <ErrorPage contained error={error} />,
    onSuccess: ({ value }) => (
      <div className="flex flex-col items-start gap-3">
        <p className="text-sm text-muted-foreground">
          {m.slack_setup_instructions()}
        </p>
        <p className="text-sm text-muted-foreground">
          {m.slack_setup_create_body()}
        </p>
        <Button
          render={
            <a
              href={value.createUrl}
              target="_blank"
              rel="noreferrer"
              aria-label={m.slack_create_app()}
            />
          }
        >
          {m.slack_create_app()}
        </Button>
        <div className="w-full min-w-0 text-sm">
          <p className="font-medium">{m.slack_callback_label()}</p>
          <code className="mt-1 block text-xs break-all text-muted-foreground">
            {value.redirectUri}
          </code>
          <p className="mt-1 text-xs text-muted-foreground">
            {m.slack_callback_hint()}
          </p>
        </div>
        <p className="text-xs text-muted-foreground">{m.slack_host_notice()}</p>
        <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground">
          <a
            className="underline underline-offset-4 transition-colors hover:text-foreground"
            href="https://docs.slack.dev/tools/bolt-python/creating-an-app/"
            target="_blank"
            rel="noreferrer"
          >
            {m.slack_setup_docs()}
          </a>
          <a
            className="underline underline-offset-4 transition-colors hover:text-foreground"
            href="https://docs.slack.dev/authentication/sign-in-with-slack/"
            target="_blank"
            rel="noreferrer"
          >
            {m.slack_setup_oauth_docs()}
          </a>
        </div>
        <div className="flex flex-col items-start gap-2">
          <Button
            variant="secondary"
            render={
              <a
                href="/icon/icon-512.png"
                download="projectproject-slack.png"
                aria-label={m.slack_download_icon()}
              />
            }
          >
            {m.slack_download_icon()}
          </Button>
          <p className="text-xs text-muted-foreground">
            {m.slack_icon_instructions()}
          </p>
        </div>
        <details className="w-full text-sm">
          <summary className="cursor-pointer">
            {m.slack_manifest_label()}
          </summary>
          <pre className="mt-2 max-h-64 overflow-auto rounded-md bg-muted p-3 text-xs">
            {value.manifest}
          </pre>
        </details>
      </div>
    )
  })
}
