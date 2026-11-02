import { useAtomValue } from "@effect/atom-react"
import * as AsyncResult from "effect/reactivity/AsyncResult"

import { CopyButton } from "@/components/ui/copy-button"
import { m } from "@/paraglide/messages"

import { instanceHealth } from "../atoms/instance"
import { displayVersion } from "../lib/displayVersion"

export function InstanceInfo() {
  const health = useAtomValue(instanceHealth)
  const version = AsyncResult.isSuccess(health) ? health.value.version : null

  return (
    <div className="group/reveal flex h-6 items-center gap-1.5 px-3 text-muted-foreground/70">
      {version ? (
        <>
          <span
            className="min-w-0 truncate font-mono text-[10.5px] transition-colors group-hover/reveal:text-muted-foreground"
            title={version}
          >
            {displayVersion(version)}
          </span>
          <CopyButton
            value={version}
            copyLabel={m.chrome_sidebar_copy_version()}
            copiedLabel={m.chrome_sidebar_version_copied()}
            className="size-5 text-muted-foreground opacity-0 transition-opacity group-hover/reveal:opacity-100 pointer-coarse:opacity-100 focus-visible:opacity-100 data-[copied]:opacity-100"
            iconClassName="size-3"
          />
        </>
      ) : null}
    </div>
  )
}
