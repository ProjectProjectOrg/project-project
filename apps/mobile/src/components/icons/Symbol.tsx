import { SymbolView, type SymbolViewProps } from "expo-symbols"
import { useCSSVariable } from "uniwind"

export function Symbol({
  name,
  size = 17,
  muted = false
}: Readonly<{
  name: SymbolViewProps["name"]
  size?: number
  muted?: boolean
}>) {
  const color = useCSSVariable(
    muted ? "--color-muted-foreground" : "--color-foreground"
  )
  return <SymbolView name={name} size={size} tintColor={String(color)} />
}
