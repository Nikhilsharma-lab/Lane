"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { useOptimistic, useTransition } from "react"
import { impactHref, readImpactAddress, type ImpactTab } from "./impact-href"
import { ImpactScreen, type ImpactScreenProps } from "./impact-screen"

type LiveProps = Omit<ImpactScreenProps, "onTabChange" | "onPeriodChange" | "onPersonChange" | "showing">

/**
 * The Impact screen with its address (#159, #208, #283). The tab is the address's: switching tabs rewrites the address
 * in place, with nothing loaded, so it works offline too. A period or a person is read on the server, so choosing one
 * replaces the address without scrolling and the page reads it again; offline the frame holds that move (OfflineGuard).
 */
export function ImpactScreenLive(props: LiveProps) {
  const router = useRouter()
  const query = useSearchParams()
  const tab = readImpactAddress({ tab: query.get("tab") ?? undefined }).tab ?? props.tab
  const personId = props.person?.id ?? null
  const [, startTransition] = useTransition()
  // Showing names the person chosen at once, while their list is on its way.
  const [showing, setShowing] = useOptimistic(personId)

  const address = (next: { tab: ImpactTab; period?: ImpactScreenProps["period"]; person?: string | null }) =>
    impactHref({ tab: next.tab, period: "period" in next ? next.period : props.period, person: "person" in next ? next.person : personId })

  return <ImpactScreen {...props} tab={tab} showing={showing}
    onTabChange={next => window.history.replaceState(null, "", address({ tab: next }))}
    onPeriodChange={period => router.replace(address({ tab: "outcome-report", period }), { scroll: false })}
    onPersonChange={person => startTransition(() => {
      setShowing(person)
      router.replace(address({ tab: "my-work", person }), { scroll: false })
    })} />
}
