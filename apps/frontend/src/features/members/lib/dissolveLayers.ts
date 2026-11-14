export type DissolveLayer<A> = Readonly<{
  id: number
  subject: A
  coverage: number
}>

export type DissolveBand<A> = DissolveLayer<A> & Readonly<{ from: number }>

export const dissolveBands = <A>(
  layers: ReadonlyArray<DissolveLayer<A>>
): ReadonlyArray<DissolveBand<A>> => {
  let covered = 0
  const bands: Array<DissolveBand<A>> = []
  for (let index = layers.length - 1; index >= 0; index--) {
    const layer = layers[index]
    if (layer.coverage > covered) bands.unshift({ ...layer, from: covered })
    covered = Math.max(covered, layer.coverage)
  }
  return bands
}

export const pushDissolveLayer = <A>(
  layers: ReadonlyArray<DissolveLayer<A>>,
  previous: A,
  next: A
): ReadonlyArray<DissolveLayer<A>> => {
  const base =
    layers.length > 0 ? layers : [{ id: 0, subject: previous, coverage: 1 }]
  const visible = dissolveBands(base)
  const id = (base.at(-1)?.id ?? 0) + 1
  return [
    ...visible.map(({ id, subject, coverage }) => ({ id, subject, coverage })),
    { id, subject: next, coverage: 0 }
  ]
}
