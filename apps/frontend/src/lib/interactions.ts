import * as Atom from "effect/reactivity/Atom"

export const openInteractions = Atom.make(0).pipe(Atom.keepAlive)
