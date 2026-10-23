"use client"

import { useRouter } from "next/navigation"
import { impactHref } from "./impact-href"
import { ImpactScreen, type ImpactScreenProps } from "./impact-screen"

// The Dashboard with its router: a period change in the Whole org tab moves the URL, and the page reads it again (#159).
export function ImpactScreenLive(props: Omit<ImpactScreenProps, "onPeriodChange">) {
  const router = useRouter();
  const personId = props.person?.id;
  return <ImpactScreen {...props} onPeriodChange={period => router.replace(impactHref({ period, person: personId }))} />;
}
