import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import { COMMAND_PRIORITY_LOW, KEY_ENTER_COMMAND } from "lexical"
import { useEffect } from "react"

// ⌘↵ (Ctrl+Enter off a Mac) sends; Enter on its own stays a new line, so
// writing a comment never sends it by accident.
export function SubmitShortcutPlugin({
  onSubmit
}: Readonly<{ onSubmit: () => void }>) {
  const [editor] = useLexicalComposerContext()
  useEffect(
    () =>
      editor.registerCommand(
        KEY_ENTER_COMMAND,
        (event) => {
          if (event === null || event.isComposing) return false
          if (!event.metaKey && !event.ctrlKey) return false
          event.preventDefault()
          onSubmit()
          return true
        },
        COMMAND_PRIORITY_LOW
      ),
    [editor, onSubmit]
  )
  return null
}
