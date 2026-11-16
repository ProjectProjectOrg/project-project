import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import {
  COMMAND_PRIORITY_LOW,
  INSERT_PARAGRAPH_COMMAND,
  KEY_ENTER_COMMAND
} from "lexical"
import { useEffect } from "react"

export function SubmitOnEnterPlugin({
  onSubmit
}: Readonly<{ onSubmit: () => void }>) {
  const [editor] = useLexicalComposerContext()
  useEffect(
    () =>
      editor.registerCommand(
        KEY_ENTER_COMMAND,
        (event) => {
          if (event === null || event.isComposing) return false
          event.preventDefault()
          if (event.shiftKey) {
            return editor.dispatchCommand(INSERT_PARAGRAPH_COMMAND, undefined)
          }
          onSubmit()
          return true
        },
        COMMAND_PRIORITY_LOW
      ),
    [editor, onSubmit]
  )
  return null
}
