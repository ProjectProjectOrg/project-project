import { LogoLoader } from "@pp/ui/logo"

export function LoaderOverlay({ active }: { active: boolean }) {
  return (
    <div
      className="pp-loader-overlay"
      data-active={active}
      aria-hidden={!active}
      aria-busy={active}
    >
      <LogoLoader className="size-28" />
    </div>
  )
}
