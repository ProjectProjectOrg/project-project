import { SymbolView, type SymbolViewProps } from "expo-symbols"
import { useCSSVariable } from "uniwind"

export type SymbolName = Extract<SymbolViewProps["name"], string>

export function Symbol({
  name,
  size = 17,
  muted = false,
  color
}: Readonly<{
  name: SymbolViewProps["name"]
  size?: number
  muted?: boolean
  color?: string
}>) {
  const theme = useCSSVariable(
    muted ? "--color-muted-foreground" : "--color-foreground"
  )
  return (
    <SymbolView name={name} size={size} tintColor={color ?? String(theme)} />
  )
}
