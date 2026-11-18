import * as Data from "effect/Data"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import type { ReactNode } from "react"

import { ErrorPage } from "@/components/shell/ErrorPage"

export type AsyncFailure<E> = Data.TaggedEnum<{
  error: { readonly error: E }
  defect: { readonly defect: unknown }
}>
interface AsyncFailureDefinition extends Data.TaggedEnum.WithGenerics<1> {
  readonly taggedEnum: AsyncFailure<this["A"]>
}
export const AsyncFailure = Data.taggedEnum<AsyncFailureDefinition>()

type AsyncViewProps<A, E> = Readonly<{
  result: AsyncResult.AsyncResult<A, E>
  onInitial: () => ReactNode
  onSuccess: (success: AsyncResult.Success<A, E>) => ReactNode
  onFailure?: (failure: AsyncFailure<E>) => ReactNode
  reset?: () => void
  contained?: boolean
}>

export function AsyncView<A, E>({
  result,
  onInitial,
  onSuccess,
  onFailure,
  reset,
  contained
}: AsyncViewProps<A, E>) {
  return AsyncResult.matchWithError(result, {
    onInitial,
    onError: (error) =>
      onFailure === undefined ? (
        <ErrorPage error={error} reset={reset} contained={contained} />
      ) : (
        onFailure(AsyncFailure.error({ error }))
      ),
    onDefect: (defect) =>
      onFailure === undefined ? (
        <ErrorPage error={defect} reset={reset} contained={contained} />
      ) : (
        onFailure(AsyncFailure.defect({ defect }))
      ),
    onSuccess
  })
}
