import { MembersHost } from "@/components/auth/members-host";
import { Skeleton } from "@/components/arc/skeleton/skeleton";

export default function MembersLoading() {
  return <MembersHost><Skeleton label="Loading Members" avatar lines={6} /></MembersHost>;
}
