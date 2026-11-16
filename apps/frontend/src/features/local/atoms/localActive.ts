import * as Atom from "effect/reactivity/Atom"

export const localActive = Atom.family((_scope: string) =>
  Atom.make(false).pipe(Atom.keepAlive)
)
