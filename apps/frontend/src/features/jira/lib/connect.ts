export const jiraConnectHref = (returnPath: string) =>
  `/api/integrations/jira/oauth/start?returnPath=${encodeURIComponent(returnPath)}`
