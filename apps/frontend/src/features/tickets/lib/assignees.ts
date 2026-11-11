export const toggleAssignee = (
  assignees: ReadonlyArray<string>,
  id: string
): ReadonlyArray<string> =>
  assignees.includes(id)
    ? assignees.filter((assignee) => assignee !== id)
    : [...assignees, id]
