import * as AsyncResult from "effect/reactivity/AsyncResult"
import type * as Atom from "effect/reactivity/Atom"

import { projectScope } from "@/api/keys"

import { localActive } from "./localActive"

export const readLocal = <A, E>(
  get: Atom.AtomContext,
  params: Readonly<{ orgSlug: string; slug: string }>,
  local: () => Atom.Atom<AsyncResult.AsyncResult<A | null, E>>
): AsyncResult.AsyncResult<A, never> | null => {
  if (!get(localActive(projectScope(params.orgSlug, params.slug)))) return null
  const result = get(local())
  if (AsyncResult.isInitial(result)) return AsyncResult.initial(true)
  if (!AsyncResult.isSuccess(result) || result.value === null) return null
  return AsyncResult.success<A>(result.value)
}
