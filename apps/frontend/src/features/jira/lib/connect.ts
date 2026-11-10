export const jiraConnectHref = (returnPath: string): string =>
  `/api/integrations/jira/oauth/start?returnPath=${encodeURIComponent(returnPath)}`
