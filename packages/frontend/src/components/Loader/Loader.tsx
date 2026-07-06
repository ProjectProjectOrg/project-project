import logoRaw from "@/public/logo/logo.svg?raw"

const themedLogo = logoRaw
  .replace(/fill="#FEFEFE"/g, 'fill="var(--foreground)"')
  .replace(/fill="#807F7F"/g, 'fill="var(--muted-foreground)"')
  .replace(/<svg([^>]*?)\swidth="[^"]*"/, "<svg$1")
  .replace(/<svg([^>]*?)\sheight="[^"]*"/, "<svg$1")

type LoaderProps = {
  size?: number | string
  className?: string
  style?: React.CSSProperties
}

export function Loader({ size = 96, className, style }: LoaderProps) {
  const dim = typeof size === "number" ? `${size}px` : size
  return (
    <div
      className={`pp-loader ${className ?? ""}`}
      style={{ width: dim, height: dim, ...style }}
      dangerouslySetInnerHTML={{ __html: themedLogo }}
    />
  )
}
