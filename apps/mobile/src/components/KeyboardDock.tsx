import { requireNativeView } from "expo"
import type { ViewProps } from "react-native"

// Rides above the keyboard in the keyboard's own animation
// (modules/keyboard-dock). Place it at the bottom of the screen with its
// home-indicator padding: it rises by the keyboard's height minus that inset.
export const KeyboardDock = requireNativeView<ViewProps>("KeyboardDock")
