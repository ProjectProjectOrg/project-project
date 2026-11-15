import { CopyButton } from "@pp/ui/copy-button"
import { TooltipGroup, TooltipGroupTrigger } from "@pp/ui/tooltip"
import { Download } from "lucide-react"

const ROWS = [
  { filename: "login-error.png", size: "184 KB" },
  { filename: "sprint-review.pdf", size: "2.1 MB" },
  { filename: "export.csv", size: "36 KB" }
] as const

// The attachments table's row actions: Copy as Markdown and Download appear
// when you hover a row. One tooltip serves the whole table, so moving down
// the rows or across the two buttons glides it from one to the next.
export default function AttachmentRows() {
  return (
    <TooltipGroup>
      <table className="w-full max-w-xl border-collapse text-left">
        <tbody>
          {ROWS.map((row) => (
            <tr
              key={row.filename}
              className="group/reveal border-b border-border transition-colors hover:bg-hover"
            >
              <td className="w-full max-w-0 px-2 py-2">
                <span className="truncate font-mono text-body">
                  {row.filename}
                </span>
              </td>
              <td className="px-2 py-2 text-right text-body whitespace-nowrap text-muted-foreground tabular-nums">
                {row.size}
              </td>
              <td className="px-2 py-2 text-right whitespace-nowrap">
                <span className="flex items-center justify-end gap-0.5 opacity-0 transition-opacity group-hover/reveal:opacity-100 focus-within:opacity-100">
                  <TooltipGroupTrigger
                    tooltip="Copy as Markdown"
                    render={<span className="inline-flex" />}
                  >
                    <CopyButton
                      nativeTitle={false}
                      value={`[${row.filename}](https://files.example.com/${row.filename})`}
                      copyLabel="Copy as Markdown"
                      copiedLabel="Copied"
                    />
                  </TooltipGroupTrigger>
                  <TooltipGroupTrigger
                    tooltip="Download"
                    render={
                      <a
                        href={`#${row.filename}`}
                        aria-label="Download"
                        className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors transition-transform duration-100 hover:bg-hover hover:text-foreground active:scale-[0.97]"
                      />
                    }
                  >
                    <Download className="size-3.5" strokeWidth={1.75} />
                  </TooltipGroupTrigger>
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </TooltipGroup>
  )
}
