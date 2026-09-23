import { Loader } from "./Loader"

export function LoaderOverlay({ active }: { active: boolean }) {
  return (
    <div
      className="pp-loader-overlay"
      data-active={active}
      aria-hidden={!active}
      aria-busy={active}
    >
      <Loader size={112} />
    </div>
  )
}
