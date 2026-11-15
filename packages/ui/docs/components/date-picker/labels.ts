// Literal labels for the gallery; the app passes its messages (dateLabels()).
export const singleLabels = {
  placeholder: "Pick a date",
  type: "Type a date: fri, nov 20, in 3 days",
  unreadable: "Can't read that date",
  previousMonth: "Previous month",
  nextMonth: "Next month"
} as const

export const rangeLabels = {
  placeholder: "Pick dates",
  type: "Type dates: mon for 2 weeks, nov 16 to 27",
  unreadable: "Can't read that date",
  previousMonth: "Previous month",
  nextMonth: "Next month"
} as const
