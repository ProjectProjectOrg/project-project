import { lazy, Suspense } from "react"

import { localCopyEnabled } from "../lib/localCopyFlag"

const KeepLocalCopy = lazy(() => import("./KeepLocalCopy"))

export function LocalProjectCopy() {
  return localCopyEnabled() ? (
    <Suspense fallback={null}>
      <KeepLocalCopy />
    </Suspense>
  ) : null
}
