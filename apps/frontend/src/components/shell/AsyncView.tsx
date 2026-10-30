import * as Option from "effect/Option"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import type { ReactNode } from "react"

import { ErrorPage } from "@/components/shell/ErrorPage"
import { staleSuccess } from "@/lib/staleSuccess"
import { m } from "@/paraglide/messages"

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
  return Option.match(staleSuccess(result), {
    onSome: (success) => (
      <>
        <p role="alert" className="text-xs text-destructive">
          {m.error_refresh_failed()}
        </p>
        {onSuccess(success)}
      </>
    ),
    onNone: () =>
      AsyncResult.matchWithError(result, {
        onInitial,
        onError: (error) => (
          <ErrorPage error={error} reset={reset} contained={contained} />
        ),
        onDefect: (defect) => (
          <ErrorPage error={defect} reset={reset} contained={contained} />
        ),
        onSuccess
      })
  })
}
