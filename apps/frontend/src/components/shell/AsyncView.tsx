import * as AsyncResult from "effect/reactivity/AsyncResult"
import type { ReactNode } from "react"

import { ErrorPage } from "@/components/shell/ErrorPage"

type AsyncViewProps<A, E> = Readonly<{
  result: AsyncResult.AsyncResult<A, E>
  onInitial: () => ReactNode
  onSuccess: (success: AsyncResult.Success<A, E>) => ReactNode
  reset?: () => void
  contained?: boolean
}>

export function AsyncView<A, E>({
  result,
  onInitial,
  onSuccess,
  reset,
  contained
}: AsyncViewProps<A, E>) {
  return AsyncResult.matchWithError(result, {
    onInitial,
    onError: (error) => (
      <ErrorPage error={error} reset={reset} contained={contained} />
    ),
    onDefect: (defect) => (
      <ErrorPage error={defect} reset={reset} contained={contained} />
    ),
    onSuccess
  })
}
