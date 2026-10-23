import { graphql as graphqlRequest } from "@octokit/graphql"
import { Octokit } from "octokit"

export const octokitFor = (token: string) => new Octokit({ auth: token })

export const graphqlFor = (token: string) =>
  graphqlRequest.defaults({ headers: { authorization: `token ${token}` } })
