import { RequestsWorkspaceLoading } from "../requests-workspace-loading"

// #271 (A115): the list's skeleton belongs to the list alone. At the (app) level it caught every move between
// pages, so opening a Request from Inbox or Impact showed the list's layout before the Request's own skeleton.
export default function ListLoading() {
  return <RequestsWorkspaceLoading />
}
