import { parseRequestProjectFilter, parseRequestStatusFilter } from "@/lib/request-workspace"
import { RequestsWorkspace } from "./requests-workspace"

export default async function RequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string | string[]; project?: string | string[] }>
}) {
  const { status, project } = await searchParams

  return <RequestsWorkspace filter={parseRequestStatusFilter(status)} projectFilter={parseRequestProjectFilter(project)} />
}
