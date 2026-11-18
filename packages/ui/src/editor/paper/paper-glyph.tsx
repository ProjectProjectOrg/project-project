// Paper's mark, at the size of the text around it.
export function PaperGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <rect
        width="16"
        height="16"
        rx="3.5"
        className="fill-[oklch(0.738562_0.104396_258.136)]"
      />
      <path
        className="fill-[oklch(0.969316_0.00397_106.473)]"
        d="M5 3.5h7.5v6H9.5V5H5z"
      />
      <path
        className="fill-[oklch(0.969316_0.00397_106.473)]"
        d="M3.5 5H5v4.5h4.5v3H3.5z"
      />
    </svg>
  )
}
