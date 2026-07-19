import { parseRequestStatusFilter } from "@/lib/request-workspace"
import { RequestsWorkspace } from "./requests-workspace"

export default async function RequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string | string[] }>
}) {
  const { status } = await searchParams

  return <RequestsWorkspace filter={parseRequestStatusFilter(status)} />
}
