import type { FormattingToolbarLabels } from "./formatting-toolbar-parts"
import { m } from "./messages"

// The formatting toolbar's strings, from the editor's messages.
export const formattingToolbarLabels = (): FormattingToolbarLabels => ({
  toolbar: m.editor_format_toolbar(),
  text: m.editor_format_text(),
  block: m.editor_format_block(),
  formats: {
    bold: m.editor_format_bold(),
    italic: m.editor_format_italic(),
    strikethrough: m.editor_format_strikethrough(),
    code: m.editor_format_code()
  },
  link: m.editor_format_link(),
  unlink: m.editor_format_unlink(),
  linkPlaceholder: m.editor_format_link_placeholder(),
  blocks: {
    heading: m.editor_slash_basic_heading(),
    "bullet-list": m.editor_slash_basic_bullet_list(),
    "numbered-list": m.editor_slash_basic_numbered_list(),
    checklist: m.editor_slash_basic_checklist(),
    quote: m.editor_slash_basic_quote(),
    code: m.editor_slash_basic_code()
  }
})
