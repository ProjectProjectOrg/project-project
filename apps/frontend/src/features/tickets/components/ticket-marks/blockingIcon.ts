import { createLucideIcon } from "lucide-react"

export const SquareOctagonMinus = createLucideIcon({
  name: "square-octagon-minus",
  node: [
    [
      "path",
      {
        d: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4",
        key: "square"
      }
    ],
    [
      "path",
      {
        d: "M14.2 11h4.6l3.2 3.2v4.6L18.8 22h-4.6L11 18.8v-4.6z",
        key: "octagon"
      }
    ],
    ["path", { d: "M14.5 16.5h4", key: "minus" }]
  ]
})

export const SquarePlusCorner = createLucideIcon({
  name: "square-plus-corner",
  node: [
    [
      "path",
      {
        d: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4",
        key: "square"
      }
    ],
    ["path", { d: "M16.5 12v9", key: "vertical" }],
    ["path", { d: "M12 16.5h9", key: "horizontal" }]
  ]
})
