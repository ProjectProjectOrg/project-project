import * as Atom from "effect/reactivity/Atom"

export const liveFresh = Atom.make(false).pipe(Atom.keepAlive)

export const focusWhileLiveIsStale = Atom.readable((get) => {
  get.subscribe(Atom.windowFocusSignal, (count) => {
    if (!get.once(liveFresh)) get.setSelf(count)
  })
  return get.once(Atom.windowFocusSignal)
})
