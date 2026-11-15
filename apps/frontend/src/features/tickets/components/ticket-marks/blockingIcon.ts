import { icon, type IconSvgElement } from "@pp/ui/icons"

// Two marks the icon set doesn't have, drawn on its 24px grid in its stroke
// style: a square with an octagon (blocked) and a square with a plus corner.

const stroke = {
  stroke: "currentColor",
  strokeLinecap: "round",
  strokeLinejoin: "round",
  strokeWidth: "1.5"
} as const

const SQUARE = "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4"

const squareOctagonMinus: IconSvgElement = [
  ["path", { d: SQUARE, key: "square", ...stroke }],
  [
    "path",
    {
      d: "M14.2 11h4.6l3.2 3.2v4.6L18.8 22h-4.6L11 18.8v-4.6z",
      key: "octagon",
      ...stroke
    }
  ],
  ["path", { d: "M14.5 16.5h4", key: "minus", ...stroke }]
]

const squarePlusCorner: IconSvgElement = [
  ["path", { d: SQUARE, key: "square", ...stroke }],
  ["path", { d: "M16.5 12v9", key: "vertical", ...stroke }],
  ["path", { d: "M12 16.5h9", key: "horizontal", ...stroke }]
]

export const SquareOctagonMinus = icon(squareOctagonMinus, "SquareOctagonMinus")
export const SquarePlusCorner = icon(squarePlusCorner, "SquarePlusCorner")
