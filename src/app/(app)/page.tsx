import { RequestsWorkspace } from "./requests-workspace"

// Plan item 1.7: the status view and Project filter are read in the browser
// (src/components/requests/list-view-state.tsx), so this page never reads
// the URL query and a view switch makes no server request.
export default function RequestsPage() {
  return <RequestsWorkspace />
}
