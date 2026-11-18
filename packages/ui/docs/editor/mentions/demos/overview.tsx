import { MentionChip } from "@pp/ui/editor/mentions/mention-chip"

import { EditorKit } from "../../kit"

function Cell({
  label,
  children
}: Readonly<{ label: string; children: React.ReactNode }>) {
  return (
    <div className="flex flex-col items-center gap-2">
      <p className="prose-md">{children}</p>
      <span className="text-caption text-muted-foreground">{label}</span>
    </div>
  )
}

// Each kind of chip, as it sits in a sentence. Hover a ticket for its card.
export default function MentionsOverview() {
  return (
    <EditorKit>
      <div className="@container w-full">
        <div className="grid grid-cols-[repeat(2,minmax(0,1fr))] justify-items-center gap-y-6 @xl:grid-cols-[repeat(4,minmax(0,1fr))]">
          <Cell label="Person">
            Ask <MentionChip type="user" id="maya" label="Maya Chen" />
          </Cell>
          <Cell label="Ticket">
            Like <MentionChip type="ticket" id="ATL-8" label="ATL-8" />
          </Cell>
          <Cell label="Other project">
            See <MentionChip type="ticket" id="billing/BIL-3" label="BIL-3" />
          </Cell>
          <Cell label="Not a ticket">
            In <MentionChip type="ticket" id="draft-1" label="draft-1" />
          </Cell>
        </div>
      </div>
    </EditorKit>
  )
}
