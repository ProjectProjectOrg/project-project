export function perLocale<A extends object, O>(
  Formatter: new (locale: string, options?: O) => A,
  options?: NoInfer<O>
) {
  const values = new Map<string, A>()
  return (locale: string) => {
    const cached = values.get(locale)
    if (cached !== undefined) return cached
    const value = new Formatter(locale, options)
    values.set(locale, value)
    return value
  }
}
