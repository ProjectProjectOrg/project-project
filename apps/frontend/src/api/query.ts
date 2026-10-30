import * as Atom from "effect/reactivity/Atom"

import { Api } from "./Api"

const revalidate = Atom.swr({
  staleTime: "30 seconds",
  revalidateOnMount: true,
  revalidateOnFocus: true,
  focusSignal: Atom.windowFocusSignal
})

const revalidating = new WeakMap<object, unknown>()

export const query = ((...args: Parameters<typeof Api.query>) => {
  const source = Api.query(...args)
  const known = revalidating.get(source)
  if (known !== undefined) return known
  const wrapped = revalidate(source)
  revalidating.set(source, wrapped)
  return wrapped
}) as unknown as typeof Api.query
