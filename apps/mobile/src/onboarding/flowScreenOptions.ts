export const flowScreenOptions = {
  headerShown: true,
  headerTransparent: true,
  headerTitle: "",
  headerShadowVisible: false,
  headerBackButtonDisplayMode: "minimal",
  // The flow's screens sit on the dither. iOS's scroll edge effect would
  // blur and lift the texture under the header and above Continue, so it
  // reads as a different grey there.
  scrollEdgeEffects: {
    top: "hidden",
    bottom: "hidden",
    left: "hidden",
    right: "hidden"
  }
} as const
