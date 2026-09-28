declare module "*.svg" {
  import type { FC } from "react"
  import type { SvgProps } from "react-native-svg"

  const Svg: FC<SvgProps & Readonly<{ drawn: string; drawnMuted?: string }>>
  export default Svg
}
