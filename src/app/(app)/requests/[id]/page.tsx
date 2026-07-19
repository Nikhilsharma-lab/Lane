import { parseRequestStatusFilter } from "@/lib/request-workspace"
import { RequestsWorkspace } from "../../requests-workspace"

export default async function RequestDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ status?: string | string[] }>
}) {
  const [{ id }, { status }] = await Promise.all([params, searchParams])

  return (
    <RequestsWorkspace
      selectedRequestId={id}
      filter={parseRequestStatusFilter(status)}
    />
  )
}
