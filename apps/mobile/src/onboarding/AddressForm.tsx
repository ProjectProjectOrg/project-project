import { useAtomSet, useAtomValue } from "@effect/atom-react"
import * as Exit from "effect/Exit"
import * as Result from "effect/Result"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import * as Atom from "effect/unstable/reactivity/Atom"
import * as Haptics from "expo-haptics"
import { useFocusEffect } from "expo-router"
import {
  type ComponentRef,
  useCallback,
  useEffect,
  useRef,
  useState
} from "react"
import {
  Keyboard,
  type LayoutRectangle,
  type TextInput,
  type TextLayoutEvent,
  View
} from "react-native"

import { Text } from "@/components/ui/text"
import { TextField } from "@/components/ui/text-field"
import { copy } from "@/copy"

import { normalizeAddress } from "./address"
import { checkServerAtom } from "./atoms"

const serverProblem = AsyncResult.matchWithError({
  onInitial: () => null,
  onSuccess: () => null,
  onError: (error: { problem: keyof typeof copy.serverProblems }) =>
    copy.serverProblems[error.problem],
  onDefect: () => copy.checkFailed
})

// The address step's state and checks, shared by the welcome screen, where
// the step grows out of the welcome, and the add-server screen.
export function useAddressForm(onChecked: () => void) {
  const check = useAtomSet(checkServerAtom, { mode: "promiseExit" })
  const resetCheck = useAtomSet(checkServerAtom)
  const checkState = useAtomValue(checkServerAtom)
  const field = useRef<ComponentRef<typeof TextInput>>(null)
  const attempt = useRef(0)
  const [address, setAddress] = useState("")
  const [submitted, setSubmitted] = useState(false)
  const origin = normalizeAddress(address, __DEV__)

  useFocusEffect(
    useCallback(
      () => () => {
        attempt.current += 1
      },
      []
    )
  )

  const edit = (next: string) => {
    setAddress(next)
    setSubmitted(false)
    attempt.current += 1
    resetCheck(Atom.Interrupt)
    resetCheck(Atom.Reset)
  }

  const submit = async () => {
    setSubmitted(true)
    if (Result.isFailure(origin)) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      return
    }
    const current = ++attempt.current
    const exit = await check(origin.success)
    if (current !== attempt.current) return
    void Haptics.notificationAsync(
      Exit.isSuccess(exit)
        ? Haptics.NotificationFeedbackType.Success
        : Haptics.NotificationFeedbackType.Error
    )
    if (Exit.isSuccess(exit)) {
      // Lower the keyboard with the push. Otherwise it stays up until this
      // screen leaves the window, after the transition.
      Keyboard.dismiss()
      onChecked()
    }
  }

  const error =
    submitted && Result.isFailure(origin)
      ? copy.addressProblems[origin.failure]
      : serverProblem(checkState)
  const hint = Result.isSuccess(origin)
    ? origin.success.startsWith("http:")
      ? copy.addressInsecure
      : copy.addressResolves(origin.success)
    : null

  // The field's ref goes apart from the form's state, which renders read.
  return {
    field,
    form: {
      address,
      edit,
      submit,
      error,
      hint,
      checking: checkState.waiting,
      empty: address.trim().length === 0
    }
  }
}

export type AddressForm = ReturnType<typeof useAddressForm>["form"]

type Box = Readonly<{ x: number; y: number; width: number; height: number }>
type TextLayoutLine = TextLayoutEvent["nativeEvent"]["lines"][number]

// Where the step's elements are, relative to the fields' container: a box per
// line of text, as wide as the text runs, and one for the field with its
// label and hint. The dither clears around these rather than one box.
function useElements(onElements?: (boxes: ReadonlyArray<Box>) => void) {
  const [frames, setFrames] = useState<
    Readonly<Record<string, LayoutRectangle>>
  >({})
  const [lines, setLines] = useState<
    Readonly<Record<string, ReadonlyArray<TextLayoutLine>>>
  >({})
  useEffect(() => {
    if (onElements === undefined) return
    const boxes = Object.entries(frames).flatMap(([key, frame]) => {
      const textLines = lines[key]
      return textLines === undefined
        ? [frame]
        : textLines.map((line) => ({
            x: frame.x + line.x,
            y: frame.y + line.y,
            width: line.width,
            height: line.height
          }))
    })
    onElements(boxes)
  }, [frames, lines, onElements])
  const track = (key: string) => ({
    onLayout: ({ nativeEvent }: { nativeEvent: { layout: LayoutRectangle } }) =>
      setFrames((current) => ({ ...current, [key]: nativeEvent.layout }))
  })
  const trackText = (key: string) => ({
    ...track(key),
    onTextLayout: ({ nativeEvent }: TextLayoutEvent) =>
      setLines((current) => ({ ...current, [key]: nativeEvent.lines }))
  })
  return { track, trackText }
}

export function AddressFields({
  form,
  field,
  onElements
}: Readonly<{
  form: AddressForm
  field: ReturnType<typeof useAddressForm>["field"]
  onElements?: (boxes: ReadonlyArray<Box>) => void
}>) {
  const { track, trackText } = useElements(onElements)
  return (
    <>
      <Text variant="caption" {...trackText("step")}>
        {copy.onboardingStep(1, 2)}
      </Text>
      <Text variant="headline" className="mt-1" {...trackText("title")}>
        {copy.addressTitle}
      </Text>
      <Text variant="muted" className="mt-2" {...trackText("body")}>
        {copy.addressBody}
      </Text>
      <View className="mt-6" {...track("field")}>
        {/* Return checks the address and keeps the keyboard up. The field
            stays editable during a check, since typing cancels it and
            disabling a focused field would drop the keyboard. */}
        <TextField
          label={copy.addressLabel}
          placeholder={copy.addressPlaceholder}
          mono
          value={form.address}
          onChangeText={form.edit}
          onSubmitEditing={() => void form.submit()}
          submitBehavior="submit"
          ref={field}
          keyboardType="url"
          textContentType="URL"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="url"
          returnKeyType="go"
          error={form.error}
          hint={form.hint}
        />
      </View>
    </>
  )
}
