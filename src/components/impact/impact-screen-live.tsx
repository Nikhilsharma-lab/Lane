"use client"

import { useRouter } from "next/navigation"
import { impactHref } from "./impact-href"
import { ImpactScreen, type ImpactScreenProps } from "./impact-screen"

// The Impact screen with its router: a period picked in the Outcome report moves the URL, and the page reads it again (#159, #208).
export function ImpactScreenLive(props: Omit<ImpactScreenProps, "onPeriodChange">) {
  const router = useRouter();
  const personId = props.person?.id;
  return <ImpactScreen {...props} onPeriodChange={period => router.replace(impactHref({ period, person: personId }), { scroll: false })} />;
}
