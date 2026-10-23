import logoRaw from "@/assets/logo/logo.svg?raw"

const themedLogo = logoRaw
  .replace(/fill="#FEFEFE"/g, 'fill="var(--foreground)"')
  .replace(/fill="#807F7F"/g, 'fill="var(--muted-foreground)"')
  .replace(/<svg([^>]*?)\swidth="[^"]*"/, "<svg$1")
  .replace(/<svg([^>]*?)\sheight="[^"]*"/, "<svg$1")

export function LoaderOverlay({ active }: { active: boolean }) {
  return (
    <div
      className="pp-loader-overlay"
      data-active={active}
      aria-hidden={!active}
      aria-busy={active}
    >
      <div
        className="pp-loader size-28"
        dangerouslySetInnerHTML={{ __html: themedLogo }}
      />
    </div>
  )
}
