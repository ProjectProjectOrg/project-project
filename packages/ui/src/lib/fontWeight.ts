// Weights set through variation settings (for labels that animate weight).
// Setting font-variation-settings replaces the inherited one, so each also
// carries Allo's roundness (--font-roundness, theme.css).
export const fontWeights = {
  normal: "'wght' 400, 'ROND' var(--font-roundness)",
  semibold: "'wght' 550, 'ROND' var(--font-roundness)",
  bold: "'wght' 700, 'ROND' var(--font-roundness)"
} as const
