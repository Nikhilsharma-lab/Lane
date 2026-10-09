import { parseRequestProjectFilter, parseRequestStatusFilter } from "@/lib/request-workspace"
import { RequestsWorkspace } from "../../requests-workspace"

export default async function RequestDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ status?: string | string[]; project?: string | string[] }>
}) {
  const [{ id }, { status, project }] = await Promise.all([params, searchParams])

  return (
    <RequestsWorkspace
      selectedRequestId={id}
      filter={parseRequestStatusFilter(status)}
      projectFilter={parseRequestProjectFilter(project)}
    />
  )
}
