import { useAtomValue } from "@effect/atom-react"
import { CopyButton } from "@pp/ui/copy-button"
import { Reveal } from "@pp/ui/reveal"
import * as AsyncResult from "effect/reactivity/AsyncResult"

import { m } from "@/paraglide/messages"

import { instanceHealth } from "../atoms/instance"
import { displayVersion } from "../lib/displayVersion"

export function InstanceInfo() {
  const health = useAtomValue(instanceHealth)
  const version = AsyncResult.isSuccess(health) ? health.value.version : null

  return (
    <div className="group/reveal flex h-6 items-center gap-1.5 px-3 text-muted-foreground">
      {version ? (
        <>
          <span
            className="min-w-0 truncate text-micro tabular-nums transition-colors group-hover/reveal:text-muted-foreground"
            title={version}
          >
            {displayVersion(version)}
          </span>
          <Reveal>
            <CopyButton
              value={version}
              copyLabel={m.chrome_sidebar_copy_version()}
              copiedLabel={m.chrome_sidebar_version_copied()}
              className="size-5"
              iconClassName="size-3"
            />
          </Reveal>
        </>
      ) : null}
    </div>
  )
}
